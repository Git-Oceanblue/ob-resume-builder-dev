

import asyncio
import json
import logging
import os
import re
from datetime import datetime
from typing import Dict, List, Any, Optional, AsyncGenerator, Tuple
from dataclasses import dataclass
from enum import Enum

from dotenv import load_dotenv, find_dotenv
from .openai_client import OpenAIClient
from .agent_schemas import ResumeAgentSchemas
from .token_logger import start_timing, log_cache_analysis
from .chunk_resume import strip_bullet_prefix
from .validation_schemas import (
    score_employment_entry,
    score_certification_entry,
    EmploymentHistoryOut,
    CertificationsOut,
)

load_dotenv(find_dotenv())

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# NORMALIZATION HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def normalize_person_name(name: str) -> str:
    """
    Normalize extracted person name by removing non-name metadata and
    applying proper Title Case.

    FIX #8: Added title-case conversion so names like 'sAI mOHANA' → 'Sai Mohana'

    Example:
        'sAI mOHANA sRAVANI (Preferred Name: Sravani Kusam)' → 'Sai Mohana Sravani'
    """
    if not name:
        return ""

    normalized = " ".join((name or "").split())

    # Remove explicit leading labels.
    normalized = re.sub(
        r"^\s*(?:name|candidate name|full name)\s*[:\-]\s*",
        "",
        normalized,
        flags=re.IGNORECASE
    )

    metadata_keywords = (
        r"preferred\s*name|pronouns?|a\.?\s*k\.?\s*a\.?|aka|also known as|"
        r"legal name|nickname|maiden name"
    )

    # Remove bracketed metadata chunks such as "(Preferred Name: ...)".
    normalized = re.sub(
        rf"\s*[\(\[\{{][^)\]\}}]*(?<!\w)(?:{metadata_keywords})(?!\w)[^)\]\}}]*[\)\]\}}]\s*",
        " ",
        normalized,
        flags=re.IGNORECASE
    )

    # Remove inline metadata tails (if model outputs them outside brackets).
    normalized = re.sub(
        rf"(?<!\w)(?:{metadata_keywords})(?!\w)(?:\s*[:\-])?\s+.*$",
        "",
        normalized,
        flags=re.IGNORECASE
    )

    # Keep only characters typically seen in names.
    normalized = re.sub(r"[^A-Za-z\.\-'\s]", " ", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip(" -,:;")

    # ✅ FIX #8: Apply Title Case to each word, handle apostrophe names (O'Brien)
    words = normalized.split()
    title_cased_words = []
    for word in words:
        if not word:
            continue
        if "'" in word:
            parts = word.split("'")
            parts = [p.capitalize() if p else p for p in parts]
            title_cased_words.append("'".join(parts))
        else:
            title_cased_words.append(word.capitalize())

    return " ".join(title_cased_words).strip()


def normalize_work_period(work_period: str) -> str:
    """
    Normalize work period to: 'MMM YYYY - MMM YYYY'  or  'MMM YYYY - Till Date'

    FIX #6: Added year-only format handling (e.g. '2024-2025', '2024/2025')
    FIX #12: Added validation logging for non-standard month/year formats
    """
    if not work_period:
        return work_period

    # Step 1: Normalize dash/slash variants
    normalized = (
        work_period
        .replace('–', '-')
        .replace('—', '-')
    )

    # Step 2: Replace "to", "present", "current", "till now" with separator
    normalized = re.sub(
        r'\s+to\s+',
        ' - ',
        normalized,
        flags=re.IGNORECASE
    )

    # Step 3: Normalize forward-slash as separator (year-only format like 2024/2025)
    # Only do this when it looks like a date separator, not a date within a word
    normalized = re.sub(r'(\d)\s*/\s*(\d)', r'\1 - \2', normalized)

    # Step 4: Normalise spacing around hyphen separators
    normalized = re.sub(r'\s*-\s*', ' - ', normalized)

    # Step 5: Convert full month names to 3-letter abbreviations (FIX #12)
    month_mapping = {
        'January': 'Jan', 'February': 'Feb', 'March': 'Mar',
        'April': 'Apr', 'June': 'Jun', 'July': 'Jul',
        'August': 'Aug', 'September': 'Sep', 'October': 'Oct',
        'November': 'Nov', 'December': 'Dec'
        # 'May' stays as 'May'
    }
    for full_month, abbrev in month_mapping.items():
        # Case-insensitive whole-word replacement
        normalized = re.sub(
            rf'\b{full_month}\b',
            abbrev,
            normalized,
            flags=re.IGNORECASE
        )

    # BUG 2 FIX: Also normalize partial/variant abbreviations that the LLM or
    # original resume may use (e.g. "sept" → "Sep", "octo" → "Oct", "jan." → "Jan").
    partial_month_mapping = [
        (r'\bsept\b',     'Sep'),
        (r'\bocto\b',     'Oct'),
        (r'\bjan\.',      'Jan'),
        (r'\bfeb\.',      'Feb'),
        (r'\bmar\.',      'Mar'),
        (r'\bapr\.',      'Apr'),
        (r'\bjun\.',      'Jun'),
        (r'\bjul\.',      'Jul'),
        (r'\baug\.',      'Aug'),
        (r'\bsep\.',      'Sep'),
        (r'\bnov\.',      'Nov'),
        (r'\bdec\.',      'Dec'),
    ]
    for pattern, abbrev in partial_month_mapping:
        normalized = re.sub(pattern, abbrev, normalized, flags=re.IGNORECASE)

    # FIX #6b: Handle bare year (education date like "2006")
    bare_year = re.match(r'^\s*(\d{4})\s*$', normalized)
    if bare_year:
        return bare_year.group(1)

    # FIX #6: Handle year-only formats like "2024 - 2025"
    year_only_pattern = re.match(
        r'^\s*(\d{4})\s*-\s*(\d{4})\s*$', normalized
    )
    if year_only_pattern:
        start_yr, end_yr = year_only_pattern.group(1), year_only_pattern.group(2)
        logger.warning(
            f"Year-only format detected: '{work_period}'. "
            "Returning standardised year range without months."
        )
        return f"{start_yr} - {end_yr}"

    # FIX #6: Handle "YYYY - Till Date" (year-only start, no month)
    year_till_date = re.match(
        r'^\s*(\d{4})\s*-\s*(Till Date|Present|Current|Till Now)\s*$',
        normalized,
        re.IGNORECASE
    )
    if year_till_date:
        start_yr = year_till_date.group(1)
        logger.warning(
            f"Year-only start detected: '{work_period}'. "
            "Returning standardised year-only till-date range."
        )
        return f"{start_yr} - Till Date"

    # Step 6: Handle any trailing non-numeric text → "Till Date"
    if re.search(r' - [^0-9]*$', normalized):
        normalized = re.sub(r' - [^0-9]*$', ' - Till Date', normalized)

    # FIX #12: Validate that years are 4 digits
    years_found = re.findall(r"\b(\d{1,4})\b", normalized)
    for yr in years_found:
        if len(yr) != 4:
            logger.warning(
                f"Suspicious year token '{yr}' in period '{work_period}' – "
                "expected 4-digit year."
            )

    # FIX #12: Warn if full month names remain
    remaining_full = re.findall(
        r'\b(January|February|March|April|June|July|August|'
        r'September|October|November|December)\b',
        normalized,
        re.IGNORECASE
    )
    if remaining_full:
        logger.warning(
            f"Full month name(s) still present after normalisation: "
            f"{remaining_full} in '{work_period}'"
        )

    return normalized.strip()


# Indian states and union territories — used to detect India when "India" is absent
_INDIA_STATES = {
    'andhra pradesh', 'arunachal pradesh', 'assam', 'bihar', 'chhattisgarh',
    'goa', 'gujarat', 'haryana', 'himachal pradesh', 'jharkhand', 'karnataka',
    'kerala', 'madhya pradesh', 'maharashtra', 'manipur', 'meghalaya',
    'mizoram', 'nagaland', 'odisha', 'orissa', 'punjab', 'rajasthan',
    'sikkim', 'tamil nadu', 'telangana', 'tripura', 'uttar pradesh',
    'uttarakhand', 'uttaranchal', 'west bengal',
    # Union territories
    'delhi', 'ncr', 'chandigarh', 'puducherry', 'pondicherry',
    'jammu and kashmir', 'ladakh', 'lakshadweep',
}
_INDIA_STATES_RE = re.compile(
    r'\b(' + '|'.join(re.escape(s) for s in _INDIA_STATES) + r')\b',
    re.IGNORECASE,
)

# US state name → 2-letter abbreviation mapping
_US_STATE_MAP = {
    'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
    'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
    'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI', 'Idaho': 'ID',
    'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS',
    'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
    'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN',
    'Mississippi': 'MS', 'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE',
    'Nevada': 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ',
    'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC',
    'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK', 'Oregon': 'OR',
    'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
    'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT',
    'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA',
    'West Virginia': 'WV', 'Wisconsin': 'WI', 'Wyoming': 'WY',
    # DC
    'District of Columbia': 'DC',
}

# Set of valid 2-letter US state abbreviations for quick lookup
_US_STATE_ABBREVS = set(_US_STATE_MAP.values())


def normalize_location(location: str) -> str:
    """
    Normalize location to 'City, State/Country' format.

    FIX #7 RULES:
      1. INDIA RULE:  If 'India' is mentioned → return 'City, India' only
                      (strip state codes like KA, TN, MH, Telangana, etc.)
      2. USA RULE:    Convert full state names to 2-letter abbreviations.
                      'City State' (no comma) → 'City, ST'
      3. INTERNATIONAL: Return as-is, normalising spacing around comma.
    """
    if not location:
        return location

    # Collapse extra whitespace
    normalized = ' '.join(location.split())

    # ── RULE 1: INDIA ────────────────────────────────────────────────────────
    # Detect India either by the word "India" OR by any recognised Indian
    # state / UT name (catches "Hyderabad, Telangana" with no "India" word).
    is_india = bool(re.search(r'\bIndia\b', normalized, re.IGNORECASE)) or \
               bool(_INDIA_STATES_RE.search(normalized))

    if is_india:
        # Extract city: first segment before comma / state abbreviation / "India"
        city_match = re.match(r'^([^,]+)', normalized)
        if city_match:
            city = city_match.group(1).strip()
            # Remove standalone 2-letter state codes (e.g. "KA", "TN")
            city = re.sub(r'\b[A-Z]{2}\b', '', city).strip(' ,')
            # Remove spelled-out Indian state names
            city = re.sub(r'\s*,\s*\w+\s*$', '', city).strip()
            # If city turns out to be "India" itself, return just "India"
            if city and city.lower() not in ('india', ''):
                return f"{city}, India"
        return "India"

    # ── RULE 2: USA – full state name → abbreviation ─────────────────────────
    for full_state, abbrev in _US_STATE_MAP.items():
        pattern = r',\s*' + re.escape(full_state) + r'\b'
        if re.search(pattern, normalized, re.IGNORECASE):
            normalized = re.sub(
                pattern, f', {abbrev}', normalized, flags=re.IGNORECASE
            )
            break

    # USA – "City ST" (no comma, 2-letter abbreviation) → "City, ST"
    no_comma_us = re.match(r'^([A-Za-z\s]+)\s+([A-Z]{2})$', normalized)
    if no_comma_us:
        city, state = no_comma_us.group(1).strip(), no_comma_us.group(2)
        if state in _US_STATE_ABBREVS:
            return f"{city}, {state}"

    # ── RULE 2b: US state-only (no city) ─────────────────────────────────────
    # If the entire string is just a US state name, append ", USA"
    stripped = normalized.strip()
    if stripped in _US_STATE_MAP:
        return f"{stripped}, USA"
    # If the entire string is a 2-letter US state abbreviation, append ", USA"
    if stripped in _US_STATE_ABBREVS:
        return f"{stripped}, USA"

    # ── RULE 3: General cleanup ───────────────────────────────────────────────
    # Fix spacing around comma
    normalized = re.sub(r'\s*,\s*', ', ', normalized)

    # Replace non-standard separators ( - | ) with comma-space
    normalized = re.sub(r'\s+[-|]\s+', ', ', normalized)

    return normalized.strip()


def validate_date_format(date_str: str) -> bool:
    """
    FIX #12: Validate that a date string matches 'MMM YYYY - MMM YYYY' or
    'MMM YYYY - Till Date'. Logs a warning when validation fails.
    """
    if not date_str:
        return False

    MONTH = r'(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)'
    pattern = (
        rf'^{MONTH}\s+\d{{4}}\s+-\s+'
        rf'(?:{MONTH}\s+\d{{4}}|Till Date)$'
    )

    if not re.match(pattern, date_str, re.IGNORECASE):
        logger.warning(
            f"❌ Date format invalid: '{date_str}'. "
            "Required format: 'MMM YYYY - MMM YYYY' or 'MMM YYYY - Till Date'. "
            "Example correct: 'Jan 2024 - Dec 2024'"
        )
        return False

    return True



# ─────────────────────────────────────────────────────────────────────────────
# FIX: Vendor name sanitization
# ─────────────────────────────────────────────────────────────────────────────

# Vendor names that must be removed from responsibility bullets when present.
# These are commercial product/brand names that clients prefer stripped.
_VENDOR_NAMES_TO_REMOVE = [
    'Gearset', 'Conga', 'Muelsoft', 'MuleSoft', 'Copado',
]

# Compiled pattern: matches the vendor name preceded by common lead-ins
# e.g. "using Gearset", "i.e conga", "like Copado", "via Gearset",
#      or standalone at end of sentence after comma / period.
_VENDOR_REMOVAL_PATTERN = re.compile(
    r'(?:'
    r'(?:using|via|with|through|like|i\.?e\.?|e\.?g\.?|tool|platform)\s+'  # lead-in
    r'|(?<=,\s)'  # after comma
    r')?'
    r'(?:' + '|'.join(re.escape(v) for v in _VENDOR_NAMES_TO_REMOVE) + r')'
    r'(?=\s*[,\.;\)]|\s*$)',
    re.IGNORECASE,
)


def remove_vendor_names(text: str) -> str:
    """
    FIX: Remove third-party vendor brand names from a single responsibility
    bullet line. Keeps the surrounding sentence structure intact.

    Examples:
      "Commit changes using Gearset."      → "Commit changes."
      "3rd party integrations i.e conga."  → "3rd party integrations."
      "Deployed using Copado and Gearset." → "Deployed."
    """
    if not text:
        return text

    # Remove vendor name and optional trailing comma/whitespace
    cleaned = _VENDOR_REMOVAL_PATTERN.sub('', text)

    # Collapse multi-space and tidy up orphaned trailing punctuation
    cleaned = re.sub(r'[ \t]+', ' ', cleaned)
    cleaned = re.sub(r'\s+\.', '.', cleaned)          # "word  ." → "word."
    cleaned = re.sub(r',\s*\.', '.', cleaned)          # ", ." → "."
    cleaned = re.sub(r'\s*,\s*$', '.', cleaned)        # trailing comma → "."
    cleaned = re.sub(r'\s+$', '', cleaned)
    return cleaned.strip()


_TECH_LABEL_PATTERN = re.compile(
    r'^(environment|technologies|tools\s*[&and]*\s*technologies|key\s*technologies[/\s]*skills?)\s*:',
    re.IGNORECASE
)


def sanitize_responsibilities(items: list) -> list:
    """Apply remove_vendor_names() to every bullet in a responsibility list.
    Also filters out technology/environment label lines (e.g. 'Environment: ...')
    since those are already captured in keyTechnologies.
    """
    return [
        remove_vendor_names(item)
        for item in items
        if isinstance(item, str) and not _TECH_LABEL_PATTERN.match(item.strip())
    ]


# ─────────────────────────────────────────────────────────────────────────────
# FIX 5b: Company-embedded location extractor
# ─────────────────────────────────────────────────────────────────────────────

def extract_location_from_company_name(company_name: str) -> Optional[str]:
    """
    FIX 5b: When a location is embedded in the company name
    (e.g. "IBM India Pvt Ltd, Hyderabad, India" or
          "Cybage Software Pvt Ltd, Hyderabad, India"),
    extract and normalise the location.

    Returns the normalised location string, or None if nothing found.
    """
    if not company_name:
        return None

    # Pattern: detect "..., City, Country/State" at the end of a company name
    # Also handles "..., City State" (US format)
    embedded = re.search(
        r',\s*([A-Za-z\s]+),\s*([A-Za-z\s]+)\s*$',
        company_name
    )
    if embedded:
        city = embedded.group(1).strip()
        country_or_state = embedded.group(2).strip()
        candidate = f"{city}, {country_or_state}"
        # Run through normalize_location to apply all formatting rules
        return normalize_location(candidate)

    return None


def enforce_tech_responsibility_rules(job: Dict[str, Any]) -> Dict[str, Any]:
    """
    FIX #4: If a job has projects, ensure all content lives inside the project
    objects — never duplicated at the job level.

    RESCUE LOGIC (prevents silent data loss):
      When the LLM puts responsibility bullets at job level but also adds a
      project name, the bullets must be MOVED into the project — not discarded.

      Similarly, job-level keyTechnologies is moved into projects that have none.

    Only clears job-level fields AFTER the rescue has been attempted.
    """
    projects = job.get('projects')
    if not projects or not isinstance(projects, list):
        return job

    company = job.get('companyName', '?')

    # ── Rescue job-level keyTechnologies → first project that has none ─────────
    job_tech = (job.get('keyTechnologies') or '').strip()
    if job_tech:
        for proj in projects:
            if isinstance(proj, dict) and not proj.get('keyTechnologies', '').strip():
                proj['keyTechnologies'] = job_tech
                logger.info(
                    "[FIX #4] Moved job-level keyTechnologies into project '%s' for '%s'.",
                    proj.get('projectName', '?'), company,
                )
                break
        job['keyTechnologies'] = ""

    # ── Rescue job-level responsibilities → first project that has none ────────
    job_resps = job.get('responsibilities')
    if isinstance(job_resps, list) and job_resps:
        moved = False
        for proj in projects:
            if isinstance(proj, dict):
                existing = proj.get('projectResponsibilities')
                if not existing or not isinstance(existing, list) or len(existing) == 0:
                    proj['projectResponsibilities'] = job_resps
                    logger.info(
                        "[FIX #4] Rescued %d job-level responsibility bullets into "
                        "project '%s' for '%s'.",
                        len(job_resps), proj.get('projectName', '?'), company,
                    )
                    moved = True
                    break
        if not moved:
            logger.info(
                "[FIX #4] All projects already have responsibilities for '%s' — "
                "discarding %d redundant job-level bullets.",
                company, len(job_resps),
            )
        job['responsibilities'] = []

    return job


def enforce_project_period_dedup(job: Dict[str, Any]) -> Dict[str, Any]:
    """
    FIX #3: Remove project periods that are identical to the job's workPeriod.
    A project period equal to the overall job period is almost always a copy
    introduced by the LLM when the project has no explicit date range.
    """
    job_period = (job.get('workPeriod') or '').strip()
    projects = job.get('projects')
    if not job_period or not projects or not isinstance(projects, list):
        return job

    for project in projects:
        if not isinstance(project, dict):
            continue
        proj_period = (project.get('period') or '').strip()
        if proj_period and proj_period == job_period:
            logger.warning(
                f"[FIX #3] Project period '{proj_period}' is identical to job "
                f"workPeriod for '{job.get('companyName', '?')}' → clearing "
                "project period to avoid duplication."
            )
            project['period'] = ''

    return job


def _has_explicit_project_label(name: str, text: str) -> bool:
    """
    BUG 3 FIX: Return True if *name* follows an explicit 'Project:', 'Project Name:',
    or 'Project N:' label in the source text.
    Only explicitly labeled projects are valid project entries.
    """
    pattern = re.compile(
        r'(?:^|\n)\s*project\s*(?:name\s*)?(?:\d+\s*)?[:\-]\s*' + re.escape(name),
        re.IGNORECASE | re.MULTILINE,
    )
    return bool(pattern.search(text))


def _only_in_parentheses(name: str, text: str) -> bool:
    """
    BUG 3 FIX: Return True when every occurrence of *name* in *text* is
    enclosed in parentheses (depth > 0).  Used to reject system/product
    acronyms mentioned inside responsibility bullets
    (e.g. "(including CRISE, SETS, and ICMS)") that the LLM incorrectly
    extracts as project names.
    Returns False (i.e. "not only in parens") when name is not found at all
    so we don't silently block names the heuristic cannot evaluate.
    """
    if not name or not text:
        return False
    pattern = re.compile(r'\b' + re.escape(name) + r'\b', re.IGNORECASE)
    matches = list(pattern.finditer(text))
    if not matches:
        return False  # name not found — cannot confirm it's in parens
    for m in matches:
        before = text[:m.start()]
        depth = before.count('(') - before.count(')')
        if depth <= 0:
            return False  # at least one occurrence is outside parentheses
    return True  # every occurrence is inside parentheses


def validate_project_not_fabricated(
    project_name: str,
    job_text: str
) -> bool:
    """
    FIX #10 + BUG 3 FIX: Detect projects invented by the LLM from general
    responsibilities rather than extracted from explicitly named projects.

    Returns True if the project appears to be explicitly mentioned,
    False if it looks fabricated.

    BUG 3 addition:
      • Rejects project names found ONLY inside parentheses (system names
        mentioned in responsibilities, not real project headings).
      • Rejects short ALL-CAPS acronyms that have no explicit 'Project:' label.
    """
    if not project_name:
        return True   # Empty name — let caller decide; don't block
    if not job_text:
        return True   # No source text — give benefit of doubt

    job_text_lower = job_text.lower()

    # Strip common project-label prefixes (format-agnostic)
    clean = re.sub(r'^project\s*(?:name\s*)?(?:\d+\s*)?[:\-]?\s*',
                   '', project_name, flags=re.IGNORECASE).strip()
    # Strip optional "/ Role" suffix
    clean = re.sub(r'\s*/\s*.+$', '', clean).strip()
    clean_lower = clean.lower()

    # ── BUG 3 CHECK 1: name appears ONLY inside parentheses ─────────────────
    # e.g. "(including CRISE, SETS, and ICMS)" — these are system names, not
    # project headings.
    if _only_in_parentheses(clean, job_text):
        logger.warning(
            "[BUG3] Project '%s' found only inside parentheses — "
            "treating as system/product mention, not a named project.",
            project_name,
        )
        return False

    # ── BUG 3 CHECK 2: short ALL-CAPS acronym without explicit Project: label ─
    # e.g. "CRISE", "SETS", "ICMS" — reject unless clearly labeled.
    if re.match(r'^[A-Z0-9]{2,8}$', clean.strip()) and \
            not _has_explicit_project_label(clean, job_text):
        logger.warning(
            "[BUG3] All-caps acronym '%s' has no explicit 'Project:' label — "
            "likely a system acronym mentioned in responsibilities, not a project.",
            project_name,
        )
        return False

    # ── Fast-path: explicit 'Project: NAME' label in source → always accept ──
    # If the cleaned project title has an explicit heading in the source text,
    # skip the fuzzy confidence check entirely. This prevents the heuristic
    # from dropping legitimately labeled projects whose title words happen to
    # be short or appear in an unexpected order.
    if _has_explicit_project_label(clean, job_text):
        logger.debug(
            "[FIX #10] Project '%s' has explicit label — accepted without "
            "confidence check.", project_name
        )
        return True

    # Split into meaningful terms (> 3 chars)
    terms = [t for t in re.split(r'\W+', clean_lower) if len(t) > 3]
    if not terms:
        return True  # No meaningful terms — give benefit of doubt

    found = sum(1 for t in terms if t in job_text_lower)
    confidence = found / len(terms)

    if confidence < 0.5:
        logger.warning(
            "[FIX #10] Project looks FABRICATED (score %.2f): '%s'",
            confidence, project_name
        )
        return False

    logger.debug(
        "[FIX #10] Project validated (score %.2f): '%s'",
        confidence, project_name
    )
    return True


# ─────────────────────────────────────────────────────────────────────────────
# EMPLOYMENT DEDUPLICATION
# ─────────────────────────────────────────────────────────────────────────────

def _normalize_for_dedup(s: str) -> str:
    """Normalise a string for deduplication key comparison."""
    return re.sub(r'\s+', ' ', (s or '').lower().strip())


def _deduplicate_employment_history(
    jobs: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Remove duplicate employment entries.

    Two entries are considered duplicates when they share the same
    normalised (company, workPeriod, roleName) triplet.  The first
    occurrence is kept; subsequent duplicates are dropped with a warning.

    Rationale: the LLM sometimes emits the same job block twice when a
    resume has repeated section headers or the experience section appears
    across chunk boundaries.
    """
    seen: set = set()
    deduped: List[Dict[str, Any]] = []

    for job in jobs:
        if not isinstance(job, dict):
            continue

        key = (
            _normalize_for_dedup(job.get('companyName', '')),
            _normalize_for_dedup(job.get('workPeriod', '')),
            _normalize_for_dedup(job.get('roleName', '')),
        )

        if key in seen:
            logger.warning(
                "[dedup] Dropping duplicate employment entry: '%s' / '%s' (%s)",
                job.get('companyName'), job.get('roleName'), job.get('workPeriod'),
            )
            continue

        seen.add(key)
        deduped.append(job)

    if len(deduped) < len(jobs):
        logger.info(
            "[dedup] Removed %d duplicate job entr(ies); kept %d.",
            len(jobs) - len(deduped), len(deduped),
        )

    return deduped


def _merge_same_role_entries(
    jobs: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Merge job entries that share the same (companyName, roleName) — i.e. the
    LLM incorrectly created one entry per project instead of grouping them.

    Rules:
    • Entries with the SAME (company + role) key are merged into one.
      - Projects lists are concatenated in original order.
      - Responsibilities lists are concatenated.
      - workPeriod: keep the broadest range (earliest start, latest end).
    • Entries with DIFFERENT roles at the same company are kept separate
      (those represent genuine role changes).
    • Order in the output preserves first-occurrence order.
    """
    # Ordered dict to preserve insertion order while grouping by key
    from collections import OrderedDict

    _TILL_DATE_RE = re.compile(r'till\s*date|present|current', re.IGNORECASE)

    def _sort_key_period(period: str) -> str:
        """Return a sortable string from a workPeriod (YYYY-MM)."""
        m = re.search(r'(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})',
                      period or '', re.IGNORECASE)
        if not m:
            return ''
        months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']
        return f"{m.group(2)}-{months.index(m.group(1).lower()):02d}"

    def _merge_periods(a: str, b: str) -> str:
        """Return the broader of two workPeriod strings."""
        if not a:
            return b
        if not b:
            return a
        # Extract start months
        a_parts = re.split(r'\s*[-–]\s*', a, maxsplit=1)
        b_parts = re.split(r'\s*[-–]\s*', b, maxsplit=1)
        start = a_parts[0] if _sort_key_period(a_parts[0]) <= _sort_key_period(b_parts[0]) else b_parts[0]
        a_end = a_parts[1] if len(a_parts) > 1 else ''
        b_end = b_parts[1] if len(b_parts) > 1 else ''
        # 'Till Date' / 'Present' always wins as the end
        if _TILL_DATE_RE.search(a_end) or _TILL_DATE_RE.search(b_end):
            end = a_end if _TILL_DATE_RE.search(a_end) else b_end
        else:
            end = a_end if _sort_key_period(a_end) >= _sort_key_period(b_end) else b_end
        return f"{start.strip()} - {end.strip()}" if end.strip() else start.strip()

    groups: 'OrderedDict[tuple, Dict[str, Any]]' = OrderedDict()

    for job in jobs:
        if not isinstance(job, dict):
            continue
        company  = _normalize_for_dedup(job.get('companyName', ''))
        role     = _normalize_for_dedup(job.get('roleName', ''))
        key      = (company, role)

        if key not in groups:
            groups[key] = dict(job)
            # ensure mutable lists
            groups[key]['projects']       = list(job.get('projects') or [])
            groups[key]['responsibilities'] = list(job.get('responsibilities') or [])
        else:
            existing = groups[key]
            # Merge projects
            new_projects = job.get('projects') or []
            existing['projects'].extend(new_projects)
            # Merge responsibilities
            new_resps = job.get('responsibilities') or []
            existing['responsibilities'].extend(new_resps)
            # Broaden work period
            existing['workPeriod'] = _merge_periods(
                existing.get('workPeriod', ''), job.get('workPeriod', '')
            )
            merged_count = len(new_projects) + len(new_resps)
            if merged_count:
                logger.info(
                    "[role-merge] Merged %d project(s)/%d resp(s) from duplicate "
                    "role entry '%s' @ '%s' into existing entry.",
                    len(new_projects), len(new_resps),
                    job.get('roleName', ''), job.get('companyName', ''),
                )

    result = list(groups.values())
    if len(result) < len(jobs):
        logger.info(
            "[role-merge] Collapsed %d entries into %d by merging same-role duplicates.",
            len(jobs), len(result),
        )
    return result


# ─────────────────────────────────────────────────────────────────────────────
# CERTIFICATION EXTRACTION PIPELINE
#
# Handles every cert format found in real resumes:
#   • Pipe-delimited rows       (python-docx fallback)
#   • Sequential cell-per-line  (DOCX XML primary extractor)
#   • Bullet lists
#   • Inline paragraphs         ("Certifications: A, B, C")
#   • Heading + line-break      (plain consecutive lines)
#
# Entry point: run_cert_extraction_pipeline(text, llm_raw_data)
#   → returns (flat_certs, format_str, confidence)
# ─────────────────────────────────────────────────────────────────────────────

_DASH_RE = re.compile(r'^\s*-+\s*$')

_CERT_COL_PATTERNS: List = [
    re.compile(r'^certif(?:ication|icate)(?:\s+name)?$', re.IGNORECASE),
    re.compile(r'^(?:issued\s+by|issuer|issuing\s+org(?:anization)?|institution|provider)$', re.IGNORECASE),
    re.compile(r'^date\s+(?:obtained|issued|earned|awarded|received)(?:\s*\(.*\))?$', re.IGNORECASE),
    re.compile(r'^cert(?:ification)?\s*(?:number|no\.?|id|#)(?:\s*\(.*\))?$', re.IGNORECASE),
    re.compile(r'^(?:expir(?:ation|y)\s+date|valid\s+(?:until|through)|expires?)(?:\s*\(.*\))?$', re.IGNORECASE),
]
_COL_FIELDS: List[str] = ['name', 'issuedBy', 'dateObtained', 'certificationNumber', 'expirationDate']

SPLIT_THRESHOLD = 85   # split_confidence must reach this to expand grouped names


def _col_idx(line: str) -> int:
    """Return column index 0-4 if *line* matches a known cert table header, else -1."""
    s = line.strip()
    for i, p in enumerate(_CERT_COL_PATTERNS):
        if p.match(s):
            return i
    return -1


class CertFormat(str, Enum):
    TABLE_SINGLE_ROW   = "TABLE_SINGLE_ROW"
    TABLE_MULTI_ROW    = "TABLE_MULTI_ROW"
    TABLE_SEQUENTIAL   = "TABLE_SEQUENTIAL"
    BULLET_LIST        = "BULLET_LIST"
    INLINE_PARAGRAPH   = "INLINE_PARAGRAPH"
    HEADING_LINE_BREAK = "HEADING_LINE_BREAK"
    MIXED              = "MIXED"
    UNKNOWN            = "UNKNOWN"


@dataclass
class CertGroup:
    """Intermediate representation of one certification (or a row-grouped set)."""
    issuer:              str                 = ""
    certification_name:  Optional[str]       = None
    certification_names: Optional[List[str]] = None
    issue_date:          str                 = ""
    expiration_date:     str                 = ""
    credential_id:       str                 = ""
    credential_url:      str                 = ""
    inherited_issuer:    bool                = False
    row_grouped:         bool                = False
    split_confidence:    int                 = 100
    raw_text_backup:     str                 = ""


# ── Step 1: Format classifier ─────────────────────────────────────────────────

def classify_cert_section(text: str) -> Tuple[CertFormat, int]:
    """Detect the formatting style of a certification block."""
    if not text or not text.strip():
        return CertFormat.UNKNOWN, 0

    lines       = [l.strip() for l in text.split('\n') if l.strip()]
    total_lines = max(len(lines), 1)

    pipe_lines = [l for l in lines if '|' in l and len(l.split('|')) >= 3]
    if pipe_lines:
        data_rows = [
            l for l in pipe_lines
            if not any(_col_idx(c.strip()) >= 0 for c in l.split('|') if c.strip())
        ]
        if len(data_rows) > 1:
            return CertFormat.TABLE_MULTI_ROW, 92
        return CertFormat.TABLE_SINGLE_ROW, 88

    header_col_count = sum(1 for l in lines if _col_idx(l) >= 0)
    if header_col_count >= 2:
        return CertFormat.TABLE_SEQUENTIAL, 87

    bullet_re    = re.compile(r'^[•\-\*●◦▪►✓\u2022\u2023\u25E6\u2043]')
    bullet_count = sum(1 for l in lines if bullet_re.match(l))
    if bullet_count / total_lines >= 0.4:
        return CertFormat.BULLET_LIST, 90

    joined = ' '.join(lines)
    if re.search(r'certif\w*\s*:\s*\S', joined, re.IGNORECASE) and joined.count(',') >= 1:
        confidence = min(75 + joined.count(',') * 3, 90)
        return CertFormat.INLINE_PARAGRAPH, confidence

    non_bullet = [l for l in lines if not bullet_re.match(l)]
    if len(non_bullet) >= 2 and '|' not in text:
        return CertFormat.HEADING_LINE_BREAK, 70

    return CertFormat.UNKNOWN, 50


# ── Step 2: Python table extractors ──────────────────────────────────────────

def _split_cert_names_in_cell(cell_value: str) -> Tuple[List[str], int]:
    """Split a comma-separated cell value into individual cert names."""
    if ',' not in cell_value:
        return [cell_value], 100
    parts = [p.strip() for p in cell_value.split(',') if p.strip()]
    if len(parts) <= 1:
        return [cell_value], 100
    valid = sum(1 for p in parts if len(p) >= 5 and re.match(r'^[A-Z\d]', p))
    return parts, (90 if valid == len(parts) else 75)


def _extract_pipe_groups(text: str) -> List[CertGroup]:
    """Extract CertGroups from pipe-delimited rows."""
    lines      = text.split('\n')
    pipe_lines = [l for l in lines if '|' in l and len(l.split('|')) >= 3]
    if not pipe_lines:
        return []

    col_order: List[str] = []
    groups:    List[CertGroup] = []

    for line in pipe_lines:
        cells     = [_clean_cert_field(c) for c in line.split('|')]
        non_empty = [c for c in cells if c]
        if not non_empty:
            continue

        if not col_order:
            detected = [(_COL_FIELDS[_col_idx(c)] if _col_idx(c) >= 0 else None) for c in non_empty]
            known    = sum(1 for d in detected if d is not None)
            if known >= 1 and detected and detected[0] == 'name':
                col_order = [d or f'_skip_{i}' for i, d in enumerate(detected)]
                continue

        if not col_order:
            col_order = _COL_FIELDS[:len(non_empty)]

        row_map: Dict[str, str] = {}
        for ci, fld in enumerate(col_order):
            if not fld.startswith('_skip') and ci < len(non_empty):
                row_map[fld] = non_empty[ci]

        name_raw = row_map.get('name', '')
        if not name_raw:
            continue

        cert_names, split_conf = _split_cert_names_in_cell(name_raw)
        row_grouped = len(cert_names) > 1
        groups.append(CertGroup(
            issuer              = row_map.get('issuedBy', ''),
            certification_name  = cert_names[0] if not row_grouped else None,
            certification_names = cert_names    if row_grouped     else None,
            issue_date          = row_map.get('dateObtained', ''),
            expiration_date     = row_map.get('expirationDate', ''),
            credential_id       = row_map.get('certificationNumber', ''),
            row_grouped         = row_grouped,
            split_confidence    = split_conf,
            raw_text_backup     = line.strip(),
        ))

    return groups


def _extract_sequential_groups(text: str) -> List[CertGroup]:
    """Extract CertGroups from sequential cell-per-line (DOCX XML extractor) format."""
    non_empty = [l.strip() for l in text.split('\n') if l.strip()]

    header_start = -1
    col_order:   List[str] = []
    for i, line in enumerate(non_empty):
        idx = _col_idx(line)
        if idx >= 0:
            if header_start < 0:
                header_start = i
            col_order.append(_COL_FIELDS[idx])
        elif col_order:
            break

    if not col_order or col_order[0] != 'name':
        return []

    n_cols     = len(col_order)
    data_lines = non_empty[header_start + n_cols:]
    groups:    List[CertGroup] = []

    for i in range(0, len(data_lines), n_cols):
        row = data_lines[i:i + n_cols]
        if not row:
            break
        row_map = {col_order[ci]: _clean_cert_field(row[ci]) for ci in range(min(n_cols, len(row)))}

        name_raw = row_map.get('name', '')
        if not name_raw:
            continue

        cert_names, split_conf = _split_cert_names_in_cell(name_raw)
        row_grouped = len(cert_names) > 1
        groups.append(CertGroup(
            issuer              = row_map.get('issuedBy', ''),
            certification_name  = cert_names[0] if not row_grouped else None,
            certification_names = cert_names    if row_grouped     else None,
            issue_date          = row_map.get('dateObtained', ''),
            expiration_date     = row_map.get('expirationDate', ''),
            credential_id       = row_map.get('certificationNumber', ''),
            row_grouped         = row_grouped,
            split_confidence    = split_conf,
            raw_text_backup     = ' | '.join(row[:n_cols]),
        ))

    return groups


def extract_cert_groups_python(text: str, fmt: CertFormat) -> List[CertGroup]:
    """Deterministically extract cert groups from TABLE-format text only."""
    if fmt == CertFormat.TABLE_SEQUENTIAL:
        return _extract_sequential_groups(text)
    if fmt in (CertFormat.TABLE_SINGLE_ROW, CertFormat.TABLE_MULTI_ROW):
        return _extract_pipe_groups(text)
    return []


# ── Step 3: Normalize LLM output → CertGroups ────────────────────────────────

def normalize_rich_llm_output(data: Dict[str, Any]) -> List[CertGroup]:
    """Convert LLM JSON (flat or rich schema) into CertGroup objects."""
    raw_certs = data.get('certifications', [])
    if not isinstance(raw_certs, list):
        return []

    groups: List[CertGroup] = []
    for item in raw_certs:
        if not isinstance(item, dict):
            continue

        has_rich = 'row_grouped' in item or 'split_confidence' in item or 'certification_names' in item
        if has_rich:
            c_names = [_clean_cert_field(n) for n in (item.get('certification_names') or []) if _clean_cert_field(n)]
            c_name  = _clean_cert_field(item.get('certification_name', '')) or None
            groups.append(CertGroup(
                issuer              = _clean_cert_field(item.get('issuer', '')),
                certification_name  = c_name,
                certification_names = c_names or None,
                issue_date          = _clean_cert_field(item.get('issue_date', '')),
                expiration_date     = _clean_cert_field(item.get('expiration_date', '')),
                credential_id       = _clean_cert_field(item.get('credential_id', '')),
                credential_url      = _clean_cert_field(item.get('credential_url', '')),
                inherited_issuer    = bool(item.get('inherited_issuer', False)),
                row_grouped         = bool(item.get('row_grouped', False)),
                split_confidence    = int(item.get('split_confidence', 80)),
                raw_text_backup     = _clean_cert_field(item.get('raw_text_backup', '')) or str(item),
            ))
        else:
            # Flat schema (current LLM output format)
            name = _clean_cert_field(item.get('name', '') or item.get('certification_name', ''))
            if not name:
                continue
            groups.append(CertGroup(
                issuer              = _clean_cert_field(item.get('issuedBy', '')),
                certification_name  = name,
                issue_date          = _clean_cert_field(item.get('dateObtained', '')),
                expiration_date     = _clean_cert_field(item.get('expirationDate', '')),
                credential_id       = _clean_cert_field(item.get('certificationNumber', '')),
                credential_url      = _clean_cert_field(item.get('credentialUrl', '')),
                raw_text_backup     = _clean_cert_field(item.get('rawTextBackup', '')),
            ))

    return groups


# ── Step 4: Validate ──────────────────────────────────────────────────────────

def validate_cert_groups(groups: List[CertGroup]) -> List[CertGroup]:
    """Drop invalid groups, enforce split rules, deduplicate."""
    seen:  set             = set()
    valid: List[CertGroup] = []

    for g in groups:
        if not g.raw_text_backup:
            g.raw_text_backup = g.certification_name or ', '.join(g.certification_names or []) or 'unknown'

        if g.split_confidence < SPLIT_THRESHOLD and g.certification_names:
            g.row_grouped = True

        has_name = bool(
            (g.certification_name and g.certification_name.strip())
            or any(n and n.strip() for n in (g.certification_names or []))
        )
        if not has_name:
            logger.warning("[cert-validate] Dropping group with no name: %s", g.raw_text_backup[:80])
            continue

        names_for_key = [g.certification_name] if g.certification_name else (g.certification_names or [])
        key = '|'.join(sorted(n.lower().strip() for n in names_for_key if n))
        if key in seen:
            logger.info("[cert-validate] Deduplicating: %s", key[:60])
            continue
        seen.add(key)
        valid.append(g)

    return valid


# ── Step 5: Normalize to flat frontend dicts ──────────────────────────────────

def _flat_cert(group: CertGroup, name: str) -> Dict[str, Any]:
    return {
        'name':                name.strip(),
        'issuedBy':            group.issuer,
        'dateObtained':        group.issue_date,
        'expirationDate':      group.expiration_date,
        'certificationNumber': group.credential_id,
        'credentialUrl':       group.credential_url,
        'rawTextBackup':       group.raw_text_backup,
    }


def normalize_cert_groups(groups: List[CertGroup]) -> List[Dict[str, Any]]:
    """Expand CertGroups into flat cert dicts ready for the frontend."""
    results: List[Dict[str, Any]] = []
    for group in groups:
        if group.row_grouped and group.certification_names:
            valid_names = [n.strip() for n in group.certification_names if n and n.strip()]
            if not valid_names:
                continue
            if group.split_confidence >= SPLIT_THRESHOLD:
                for name in valid_names:
                    results.append(_flat_cert(group, name))
                logger.info("[cert-norm] Expanded %d grouped certs (split_conf=%d)", len(valid_names), group.split_confidence)
            else:
                joined = ', '.join(valid_names)
                results.append(_flat_cert(group, joined))
                logger.info("[cert-norm] Kept %d names joined (split_conf=%d < %d)", len(valid_names), group.split_confidence, SPLIT_THRESHOLD)
        elif group.certification_name:
            results.append(_flat_cert(group, group.certification_name))
    return results


# ── Pipeline entry point ──────────────────────────────────────────────────────

def run_cert_extraction_pipeline(
    text: str,
    llm_raw_data: Optional[Dict[str, Any]] = None,
) -> Tuple[List[Dict[str, Any]], str, int]:
    """
    Full certification extraction pipeline.

    1. Classify format
    2. Python table extraction (TABLE formats → zero hallucination)
    3. Normalize + merge LLM output
    4. Validate
    5. Normalize to flat dicts

    Returns: (flat_certs, format_type_str, confidence)
    """
    fmt, fmt_confidence = classify_cert_section(text)
    logger.info("[cert-pipeline] Format: %s (confidence=%d)", fmt.value, fmt_confidence)

    groups: List[CertGroup] = []

    # Table formats: deterministic Python extraction first
    if fmt in (CertFormat.TABLE_SINGLE_ROW, CertFormat.TABLE_MULTI_ROW, CertFormat.TABLE_SEQUENTIAL):
        groups = extract_cert_groups_python(text, fmt)
        if groups:
            logger.info("[cert-pipeline] Python table extractor: %d group(s)", len(groups))

    # Merge LLM output (adds any certs the table extractor missed)
    if llm_raw_data:
        llm_groups = normalize_rich_llm_output(llm_raw_data)
        if llm_groups:
            logger.info("[cert-pipeline] LLM produced %d group(s)", len(llm_groups))
        if groups:
            py_keys = set()
            for g in groups:
                names = [g.certification_name] if g.certification_name else (g.certification_names or [])
                py_keys.update(n.lower().strip() for n in names if n)
            for lg in llm_groups:
                lg_names = [lg.certification_name] if lg.certification_name else (lg.certification_names or [])
                if not any(n.lower().strip() in py_keys for n in lg_names if n):
                    groups.append(lg)
        else:
            groups = llm_groups

    if fmt_confidence < 70:
        for g in groups:
            if not g.raw_text_backup or g.raw_text_backup == 'unknown':
                g.raw_text_backup = text[:500]

    groups = validate_cert_groups(groups)
    flat   = normalize_cert_groups(groups)
    logger.info("[cert-pipeline] Final flat certs: %d", len(flat))
    return flat, fmt.value, fmt_confidence


def _clean_cert_field(value: Any) -> str:
    """Return empty string for None, dash-only, or whitespace-only values."""
    if not isinstance(value, str):
        return ""
    stripped = value.strip()
    if not stripped or _DASH_RE.match(stripped):
        return ""
    return stripped


def extract_certification_fields(cert: Dict[str, Any]) -> Dict[str, Any]:
    """
    Post-process a certification dict to:
      1. Strip whitespace and replace dash-only values with "" in all string fields.
      2. Repair field bleed — when the LLM leaks issuer/date/number into 'name'.

    Returns the cleaned cert dict (same reference, mutated in place).
    """
    if not isinstance(cert, dict):
        return {}

    # ── Step 1: clean every string field ─────────────────────────────────────
    for field in ('name', 'issuedBy', 'dateObtained', 'certificationNumber', 'expirationDate'):
        cert[field] = _clean_cert_field(cert.get(field, ''))

    name = cert['name']
    if not name:
        return cert  # Nothing to repair

    # ── Step 2: field-bleed repair ────────────────────────────────────────────
    # Only attempt if the name contains metadata keywords
    if not re.search(r'\b(?:issued|obtained|date|expires?|expiration|number|#)\b',
                     name, re.IGNORECASE):
        return cert

    logger.warning(
        "[cert-repair] Name field contains metadata keywords: '%s'. "
        "Attempting field separation.", name
    )

    # Extract clean cert name: text before first metadata keyword
    clean_name_match = re.match(
        r'^(.+?)(?:\s+(?:Issued|Obtained|From|Date|by)\b)',
        name,
        re.IGNORECASE,
    )
    if clean_name_match:
        cert['name'] = clean_name_match.group(1).strip(' -()')

    # Extract issuer if not already populated
    if not cert['issuedBy']:
        issuer_m = re.search(
            r'(?:Issued\s+by|From|by)\s*[:\-]?\s*([^,\n(]+)',
            name,
            re.IGNORECASE,
        )
        if issuer_m:
            cert['issuedBy'] = _clean_cert_field(issuer_m.group(1))

    # Extract date obtained if not already populated
    if not cert['dateObtained']:
        date_m = re.search(
            r'(?:Obtained|Date|Issued)\s*[:\-]?\s*'
            r'([A-Za-z]{3,}\s+\d{4}|\d{2}/\d{2,4})',
            name,
            re.IGNORECASE,
        )
        if date_m:
            cert['dateObtained'] = _clean_cert_field(date_m.group(1))

    # Extract cert number if not already populated
    if not cert['certificationNumber']:
        num_m = re.search(
            r'(?:Number|ID|#)\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-]+)',
            name,
            re.IGNORECASE,
        )
        if num_m:
            cert['certificationNumber'] = _clean_cert_field(num_m.group(1))

    # Extract expiration if not already populated
    if not cert['expirationDate']:
        exp_m = re.search(
            r'(?:Expir(?:es?|ation))\s*[:\-]?\s*'
            r'([A-Za-z]{3,}\s+\d{4}|\d{2}/\d{2,4})',
            name,
            re.IGNORECASE,
        )
        if exp_m:
            cert['expirationDate'] = _clean_cert_field(exp_m.group(1))

    return cert


def reorder_sections_to_standard(
    sections: Dict[str, Any]
) -> Dict[str, Any]:
    """
    FIX #9: Reorder extracted sections to the standard resume format:
        header → summary → experience → education → skills → certifications

    Any extra keys (integrity_check, etc.) are preserved at the end.
    """
    STANDARD_ORDER = [
        'header', 'summary', 'experience',
        'education', 'skills', 'certifications'
    ]
    META_KEYS = {'integrity_check', 'integrity_warning', 'Uncategorized'}

    original_order = [k for k in sections if k not in META_KEYS]
    reordered: Dict[str, Any] = {}

    for key in STANDARD_ORDER:
        if key in sections:
            reordered[key] = sections[key]

    # Add any unexpected section keys that weren't in STANDARD_ORDER
    for key in original_order:
        if key not in reordered:
            reordered[key] = sections[key]

    # Preserve metadata keys
    for key in META_KEYS:
        if key in sections:
            reordered[key] = sections[key]

    if original_order != list(reordered.keys())[:len(original_order)]:
        logger.info(
            f"[FIX #9] Sections reordered from {original_order} "
            f"to {[k for k in reordered if k not in META_KEYS]}"
        )

    return reordered


# ─────────────────────────────────────────────────────────────────────────────
# CERTIFICATION SECTION EXTRACTOR
#
# Slices out only the certification-relevant portion of a full resume text so
# the LLM cert agent is never shown education or experience content.
# Used as a fallback when the chunker finds no "certifications" section.
# ─────────────────────────────────────────────────────────────────────────────

_CERT_HEADING_RE = re.compile(
    r'^\s*(?:technical\s+)?certif(?:ication|icate)s?(?:\s+and\s+certificates?)?'
    r'|^\s*licenses?\s*$'
    r'|^\s*professional\s+certif(?:ication|icate)s?\s*$',
    re.IGNORECASE | re.MULTILINE,
)
# Major section headings that mark the end of a certification block
_MAJOR_HEADING_RE = re.compile(
    r'^\s*(?:education|summary|professional\s+summary|experience|employment'
    r'|work\s+history|job\s+history|technical\s+skills?|skills?\s*(?:summary)?'
    r'|competencies|qualifications|projects?)\s*[:\-]?\s*$',
    re.IGNORECASE | re.MULTILINE,
)


def _extract_cert_text(raw_text: str) -> str:
    """
    Return the portion of *raw_text* that belongs to a certification section.

    Algorithm:
      1. Find the first line that looks like a cert heading.
      2. Scan forward until the next major section heading (or end of text).
      3. Return that slice.  If no cert heading is found, return *raw_text*
         unchanged so the LLM can still attempt extraction.
    """
    heading_m = _CERT_HEADING_RE.search(raw_text)
    if not heading_m:
        return raw_text  # no cert heading found — send full text as last resort

    start = heading_m.start()
    # Search for the next major heading AFTER our cert heading
    end_m = _MAJOR_HEADING_RE.search(raw_text, heading_m.end())
    end = end_m.start() if end_m else len(raw_text)

    sliced = raw_text[start:end].strip()
    return sliced if sliced else raw_text


# ─────────────────────────────────────────────────────────────────────────────
# AGENT ENUMS & DATACLASSES
# ─────────────────────────────────────────────────────────────────────────────

class AgentType(Enum):
    """Enumeration of available resume processing agents"""
    HEADER = "header"
    SUMMARY = "summary"
    EXPERIENCE = "experience"
    EDUCATION = "education"
    SKILLS = "skills"
    CERTIFICATIONS = "certifications"


# ── Per-agent output token budget ────────────────────────────────────────────
# Sized for openai.gpt-oss-120b-1:0 which has a 128 k context window.
# The model still prepends a <reasoning>…</reasoning> block; these values
# include generous headroom for that overhead.
_AGENT_MAX_TOKENS: Dict[AgentType, int] = {
    AgentType.HEADER:         4096,
    AgentType.SUMMARY:        8192,
    AgentType.EXPERIENCE:     16384,  # gpt-4o-mini hard cap is 16384 output tokens
    AgentType.EDUCATION:      4096,
    AgentType.SKILLS:         8192,
    AgentType.CERTIFICATIONS: 8192,
}


@dataclass
class AgentResult:
    """Structured result from an individual agent"""
    agent_type: AgentType
    data: Dict[str, Any]
    processing_time: float
    success: bool
    error_message: Optional[str] = None


# ─────────────────────────────────────────────────────────────────────────────
# SINGLE RESUME AGENT
# ─────────────────────────────────────────────────────────────────────────────

class ResumeAgent:
    """
    Individual resume processing agent with specialized extraction capabilities
    """

    def __init__(self, client: OpenAIClient, agent_type: AgentType):
        self.client     = client
        self.agent_type = agent_type
        # schema kept for reference only – not sent to the model
        self.schema     = self._get_agent_schema()

    def _get_agent_schema(self) -> Dict[str, Any]:
        schema_map = {
            AgentType.HEADER:          ResumeAgentSchemas.get_header_agent_schema,
            AgentType.SUMMARY:         ResumeAgentSchemas.get_summary_agent_schema,
            AgentType.EXPERIENCE:      ResumeAgentSchemas.get_experience_agent_schema,
            AgentType.EDUCATION:       ResumeAgentSchemas.get_education_agent_schema,
            AgentType.SKILLS:          ResumeAgentSchemas.get_skills_agent_schema,
            AgentType.CERTIFICATIONS:  ResumeAgentSchemas.get_certifications_agent_schema,
        }
        return schema_map[self.agent_type]()

    def _get_system_prompt(self) -> str:
        base_prompt = (
            "You are a specialized resume extraction agent with 40 years of experience.\n"
            "Your task is to extract ONLY the specific section you're responsible for "
            "with perfect accuracy.\n\n"
            "CRITICAL INSTRUCTIONS:\n"
            "1. Extract ONLY the section type you're assigned to.\n"
            "2. Preserve ALL content exactly as written – no summarisation.\n"
            "3. Maintain original structure and formatting.\n"
            "4. If the section doesn't exist, return empty arrays/objects.\n"
            "5. Never invent or hallucinate information.\n"
            "6. PROJECTS RULE: Only include projects if they are EXPLICITLY mentioned "
            "with a specific project name in the resume text. If no named projects are "
            "mentioned for a job, return an empty projects array.\n"
            "7. DATES: Always use 3-letter month abbreviations (Jan, Feb, Mar, …) and "
            "4-digit years (2024, not '24). Never use full month names.\n\n"
            "RESPONSE FORMAT (MANDATORY):\n"
            "- Return ONLY a single valid JSON object.\n"
            "- Do NOT include any explanation, commentary, or markdown.\n"
            "- Do NOT wrap the JSON in code fences (``` or ```json).\n"
            "- Your entire response must start with { and end with }."
        )

        section_specific = {
            AgentType.HEADER: (
                "Focus ONLY on personal information: name, title, requisition numbers."
            ),
            AgentType.SUMMARY: (
                "Extract ONLY professional summary, career overview, and profile sections. "
                "Include ALL bullet points and paragraphs without exception."
            ),
            AgentType.EXPERIENCE: (
                "Extract ONLY employment history and work experience. Include ALL jobs with "
                "COMPLETE details — every bullet, every project. Missing any content is "
                "a critical data-loss error.\n\n"
                "VERBATIM EXTRACTION (HIGHEST PRIORITY):\n"
                "• Copy every responsibility bullet EXACTLY as it appears in the resume.\n"
                "• Do NOT rephrase, rewrite, condense, or summarise any bullet point.\n"
                "• Do NOT combine multiple bullets into one or split one bullet into many.\n"
                "• The only permitted change is removing the leading bullet symbol (•, -, *, etc.).\n\n"
                "RESUME FORMAT — This resume may use a CLIENT-BASED format:\n"
                "  'Client: CompanyName, City, State  StartDate – EndDate'\n"
                "  OR 'Company Name, Location  Date Range'\n"
                "  'Location : City, State'\n"
                "  'Role: Job Title'  OR  'Roles Played: Job Title'\n"
                "  'Technologies: ...'  OR  'Tools & Technologies: ...'\n"
                "  'Project Name: ProjectTitle'  OR  'Project: ProjectTitle'\n"
                "  'Project Description: ...'\n"
                "  'Responsibilities:' or 'Responsibilities-'\n"
                "  • Bullet point 1\n\n"
                "EMPLOYER EXTRACTION:\n"
                "• companyName = actual employer. Strip 'Client:' label. No location/date.\n"
                "• For 'IBM India Pvt Ltd … Client: Lincoln Financial Group', employer is 'IBM India Pvt Ltd'.\n\n"
                "PROJECT EXTRACTION RULES:\n"
                "• Named project exists ONLY when explicitly labeled 'Project Name: X' or 'Project: X'.\n"
                "• Use EXACTLY the project title as given — do NOT reformat or add 'Project N:' prefix.\n"
                "• Extract ALL responsibility bullets under that project into projectResponsibilities.\n"
                "• When project exists, job-level 'responsibilities' MUST be [] and keyTechnologies MUST be ''.\n"
                "• 'Roles Played: X' is a ROLE TITLE, NOT a project name.\n"
                "• 'Project Description: ...' is the projectDescription field.\n"
                "• If NO explicit project label exists, use responsibilities=[] with all bullets, projects=[].\n\n"
                "TECHNOLOGY EXTRACTION RULE (CRITICAL):\n"
                "• STEP 1 — Explicit label (highest priority): Look for a line that begins\n"
                "  with 'Technologies:', 'Tools & Technologies:', 'Key Technologies/Skills:',\n"
                "  'Environment:', or similar. If found, copy the COMPLETE comma-separated list exactly as\n"
                "  written — do NOT omit or alter any item, including vendor/tool names\n"
                "  such as Gearset, Conga, MuleSoft, Copado, Azure, Jest, Mocha, etc.\n"
                "• STEP 2 — Bullet inference (fallback only): Only when NO explicit\n"
                "  Technologies label exists, infer technologies by scanning responsibility\n"
                "  bullets for tool/platform/language names.\n"
                "• IMPORTANT: The VENDOR NAME RULE below applies ONLY to responsibility\n"
                "  bullet text — NEVER remove vendor names from keyTechnologies.\n"
                "• Populate keyTechnologies at project level (if a named project exists)\n"
                "  or at job level (if no projects). NEVER leave both empty when\n"
                "  responsibilities or a Technologies label exist.\n"
                "• Lines starting with 'Environment:', 'Technologies:', 'Tools & Technologies:',\n"
                "  or 'Key Technologies/Skills:' MUST NOT be included in responsibilities or\n"
                "  projectResponsibilities — they belong only in keyTechnologies.\n\n"
                "LOCATION RULE (ANTI-HALLUCINATION — STRICT):\n"
                "• ONLY extract location if it is EXPLICITLY written in the resume text.\n"
                "• DO NOT guess, infer, or assume any city, state, or country.\n"
                "• If no location is stated for a role → leave location as empty string ''.\n"
                "• If location is embedded in the company name string "
                "  (e.g. 'IBM India Pvt Ltd, Hyderabad, India'), extract it from there.\n"
                "• India format: 'City, India' only (no state codes). USA: 'City, ST'.\n\n"
                "VENDOR NAME RULE (responsibility bullets only):\n"
                "• Remove third-party vendor brand names (Gearset, Conga, MuleSoft, Copado) "
                "  from responsibility bullet text where they appear after 'using', 'via', 'i.e'. "
                "  Replace or omit the vendor name, keeping the sentence meaningful.\n"
                "• This rule applies ONLY to responsibility/bullet text. Vendor names in a\n"
                "  Technologies/Tools label MUST be preserved in keyTechnologies.\n\n"
                "ROLE-PROJECT GROUPING RULES (CRITICAL — prevents duplicate roles):\n"
                "• If multiple projects exist under the SAME role at the SAME company, "
                "  group them under ONE job entry. Do NOT create a separate job entry per project.\n"
                "• roleName is set ONCE per (company + role) combination — it is a job-level "
                "  field, not a project-level field.\n"
                "• If the candidate held DIFFERENT roles at the same company at different times, "
                "  create SEPARATE job entries, each with its own distinct roleName.\n"
                "• NEVER repeat the same roleName across multiple job entries for the same company.\n"
                "• NEVER invent or infer a role name. Only use what is explicitly written in the "
                "  resume. If no role is stated, leave roleName as empty string ''.\n\n"
                "EXAMPLE — CORRECT (same role, 3 projects → 1 job entry):\n"
                "  { companyName: 'Acme', roleName: 'Data Engineer', workPeriod: '2021-2026',\n"
                "    projects: [{projectName:'Fraud Detection',...}, "
                "{projectName:'Risk Analytics',...}] }\n\n"
                "EXAMPLE — FORBIDDEN (same role split into 3 entries):\n"
                "  { companyName:'Acme', roleName:'Data Engineer', projects:[{Fraud Detection}] }\n"
                "  { companyName:'Acme', roleName:'Data Engineer', projects:[{Risk Analytics}] }\n"
                "  ← THIS IS WRONG. Merge all projects under one entry."
            ),
            AgentType.EDUCATION: (
                "Extract ONLY education, academic background, and degrees. "
                "Include ALL educational entries. "
                "Convert degree names to standard abbreviations (BS, MS, MBA, PhD, etc.)."
            ),
            AgentType.SKILLS: (
                "Extract ONLY technical skills with proper hierarchical structure.\n\n"
                "PRIMARY FORMAT: 'CategoryName: Skill1, Skill2, Skill3'\n"
                "  Each line starting with a label followed by colon is one category.\n"
                "  The label is the categoryName; the comma-separated values are skills.\n"
                "  EXAMPLE: 'Databases & Tools: MSSQL, DB2, Oracle 9i, JIRA' →\n"
                "    categoryName='Databases & Tools', skills=['MSSQL','DB2','Oracle 9i','JIRA']\n\n"
                "EXTRACT EVERY CATEGORY. DO NOT merge categories. DO NOT skip any. "
                "Split each value list on commas into individual skill strings."
            ),
            AgentType.CERTIFICATIONS: (
                "You are the Certification Extraction Agent.\n\n"
                "TASK: Extract ONLY professional certifications, licenses, and credentials "
                "that are EXPLICITLY listed in a CERTIFICATION / LICENSES / CERTIFICATES "
                "section of the resume text. Think step-by-step.\n\n"
                "HARD CONSTRAINTS — never violate these:\n"
                "• Do NOT extract academic degrees (Master of Science, Bachelor of, MBA, "
                "  PhD, BS, MS, B.Tech, M.Tech, Associate of, etc.). Those belong in the "
                "  EDUCATION section and must be completely ignored here.\n"
                "• Do NOT extract skills, tool names, or technologies.\n"
                "• Do NOT extract job titles, company names, or project names.\n"
                "• Do NOT infer, guess, or hallucinate any certification not written "
                "  explicitly in the certification section.\n"
                "• Do NOT invent issuing organisations — leave issuedBy empty if not stated.\n"
                "• If text contains no certifications at all, return { \"certifications\": [] }.\n\n"
                "TABLE FORMAT: The text may contain TABLE COLUMN HEADERS such as:\n"
                "  'Certification', 'Issued By', 'Date Obtained (MM/YY)',\n"
                "  'Certification Number (If Applicable)', 'Expiration Date (If Applicable)'\n"
                "  These are LAYOUT LABELS — SKIP them, extract only data rows.\n\n"
                "DASH / EMPTY HANDLING:\n"
                "• A '-' or '--' means NOT PROVIDED. Use \"\" not \"-\".\n"
                "• Blank or whitespace-only values must be returned as \"\".\n\n"
                "COMMA-SEPARATED CERTS: If multiple certifications appear on one line "
                "separated by commas (e.g. 'Cert A, Cert B'), split into separate objects.\n\n"
                "FIELD RULES:\n"
                "• 'name' — credential/certification title ONLY.\n"
                "• 'issuedBy' — issuing body if explicitly stated; else \"\".\n"
                "• 'dateObtained' — MMM YYYY format; \"\" if not stated.\n"
                "• 'certificationNumber' — ID/number if explicitly given; else \"\".\n"
                "• 'expirationDate' — MMM YYYY format; \"\" if not stated.\n\n"
                "DUPLICATE HANDLING: If the same cert appears more than once, include it once.\n\n"
                "BEFORE producing JSON, reason through:\n"
                "1. Is this item a certification/license or an academic degree?\n"
                "2. Is it explicitly written (not inferred)?\n"
                "3. Does the issuer field contain a GPA, CGPA, or university name? "
                "   If yes, this is a degree — skip it.\n"
                "4. Are there duplicates?\n"
                "5. Does the output match the required schema exactly?"
            ),
        }

        return f"{base_prompt}\n\nSPECIFIC FOCUS: {section_specific[self.agent_type]}"

    def _build_json_schema_prompt(self) -> str:
        """
        Returns the exact JSON structure the model must produce, embedded as
        plain text in the user message.  Replaces OpenAI function/tool calling.
        """
        schemas: Dict[AgentType, str] = {

            AgentType.HEADER: """\
Return ONLY this JSON object (no other text):
{
  "name": "<full name only – no emails, phones, or titles>",
  "title": "<professional title, or empty string>",
  "requisitionNumber": "<requisition/req number if mentioned, or empty string>"
}""",

            AgentType.SUMMARY: """\
Return ONLY this JSON object (no other text):
{
  "title": "<professional title, or empty string>",
  "professionalSummary": [
    "<first bullet point or paragraph exactly as written>",
    "<second bullet point exactly as written>",
    "... include ALL bullet points – do NOT truncate"
  ],
  "summarySections": [
    {
      "title": "<subsection title – only if explicitly labeled in the resume>",
      "content": ["<item 1>", "<item 2>"]
    }
  ]
}
If there are no named subsections, set summarySections to [].
Include every bullet point in professionalSummary – do NOT summarise.""",

            AgentType.EXPERIENCE: """\
Return ONLY this JSON object (no other text):
{
  "employmentHistory": [
    {
      "companyName": "<employer name only – no location, no date, no 'Client:' prefix>",
      "roleName": "<job title – from 'Role:' or 'Roles Played:' label>",
      "workPeriod": "<MMM YYYY - MMM YYYY>  or  <MMM YYYY - Till Date>",
      "location": "<City, ST>  or  <City, Country>",
      "projects": [
        {
          "projectName": "<EXACT project title as written in the resume, e.g. 'Demand to Renew'>",
          "projectLocation": "<City, Country or empty string>",
          "projectResponsibilities": ["<bullet 1 exactly as written in the resume>", "<bullet 2 exactly as written>", "... ALL bullets without exception – copy verbatim"],
          "projectDescription": "<project description as written>",
          "keyTechnologies": "<from Technologies: label, or infer from bullets>",
          "period": "<MMM YYYY - MMM YYYY or empty string if same as job period>"
        }
      ],
      "responsibilities": ["<bullet 1 exactly as written in the resume>", "<bullet 2 exactly as written>"],
      "keyTechnologies": "",
      "subsections": []
    }
  ]
}

STRICT RULES:
• Include ALL jobs – missing even one is a critical error.
• Jobs WITH 'Project Name: X' or 'Project: X' → projects=[{projectName: "X", projectResponsibilities: [...ALL bullets], ...}], responsibilities=[], keyTechnologies=""
• Jobs WITHOUT explicit project label → projects=[], responsibilities=[...ALL bullets], keyTechnologies="Tech1, Tech2, ..."
• projectName = EXACT title from resume. Do NOT add 'Project N:' prefix.
• Extract EVERY responsibility bullet – omitting bullets is a data-loss error.
• VERBATIM RULE (CRITICAL): Copy every responsibility bullet EXACTLY as written in the resume. Do NOT rephrase, rewrite, shorten, or summarise any bullet. The extracted text must be word-for-word identical to the source.
• workPeriod format: 'MMM YYYY - MMM YYYY' or 'MMM YYYY - Till Date' (3-letter months only).
• Location: 'City, ST' (USA) or 'City, Country'. India → 'City, India' only.
• companyName must NOT contain location or date – strip 'Client:' prefix if present.""",

            AgentType.EDUCATION: """\
Return ONLY this JSON object (no other text):
{
  "education": [
    {
      "degree": "<standardised abbreviation or original abbreviation if non-standard>",
      "areaOfStudy": "<field of study>",
      "school": "<institution name only – no location>",
      "location": "<City, ST>  or  <City, Country>",
      "date": "<May 2019>  or  <2015 - 2019>",
      "wasAwarded": true
    }
  ]
}

CRITICAL: Include EVERY educational entry from the text – never skip any.
Non-standard qualifications (Diploma, HDCS, Certificate, etc.) MUST be included using their original abbreviation or short name.

STANDARDISATION (apply only when degree clearly matches):
• BTech / BE / BCom / BA / Bachelor of ... → "BS"
• MTech / ME / MCA / Master of Technology / Master of Engineering / Master of Computer Applications → "MS"
• MBA → "MBA"   MA → "MA"   PhD / Doctorate → "PhD"
• Diploma / Honours Diploma / PG Diploma → keep as "Diploma" (or original abbreviation e.g. "HDCS")
• If the degree does not match any rule above, use the original abbreviation exactly as written.

Sort entries ascending by degree level where possible: Diploma/Certificate → BS → MS → MBA → PhD.
If an entry does not fit the sort order, append it at the end rather than omitting it.""",

            AgentType.SKILLS: """\
Return ONLY this JSON object (no other text):
{
  "technicalSkills": {},
  "skillCategories": [
    {
      "categoryName": "<text before the colon, e.g. SalesForce CRM>",
      "skills": ["<Skill1>", "<Skill2>", "<Skill3>"],
      "subCategories": []
    }
  ]
}

Each line in the resume formatted as "CategoryName: Skill1, Skill2, Skill3"
becomes one entry in skillCategories.
Extract EVERY category – do NOT merge or skip any.
Split comma-separated skill lists into individual array items.""",

            AgentType.CERTIFICATIONS: """\
Return ONLY this JSON object (no other text):
{
  "certifications": [
    {
      "name": "<certification title ONLY – no issuer, dates, or ID numbers here>",
      "issuedBy": "<issuing organisation if explicitly stated, else empty string>",
      "dateObtained": "<MMM YYYY if stated, else empty string>",
      "certificationNumber": "<ID/number if explicitly given, else empty string>",
      "expirationDate": "<MMM YYYY if stated, else empty string>",
      "credentialUrl": "<URL if explicitly given, else empty string>"
    }
  ]
}

CRITICAL RULES:
• Return ONLY professional certifications/licenses explicitly present – never hallucinate.
• NEVER include academic degrees (Master of Science, Bachelor of, MBA, PhD, MS, BS,
  B.Tech, M.Tech, Associate of, etc.) — those are education, NOT certifications.
• If issuedBy looks like a GPA or CGPA (e.g. "CGPA 3.9/4.0", "3.91/4.0") the entry
  is a degree — skip it entirely.
• Do NOT output skills, tool names, job titles, or company names.
• Skip table column header lines: Certification, Issued By, Date Obtained, etc.
• A dash (-) or blank means the field is empty – always use "" not "-".
• Comma-separated certs on one line must be split into separate objects.
• Deduplicate: if the same cert appears twice, include it once only.
• ONLY the credential title goes in "name" – no other data.
• credentialUrl: only populate if a URL (http/https) is explicitly present.
• If no certifications exist in the text, return { "certifications": [] }.""",
        }
        return schemas[self.agent_type]

    def _add_cache_variation(self, text: str) -> str:
        """Add session-unique prefix so each agent call is distinct."""
        import random
        import time

        timestamp  = int(time.time() * 1000)
        random_id  = ''.join(random.choices('abcdefghijklmnopqrstuvwxyz0123456789', k=8))
        agent_session = f"AGENT_{self.agent_type.value.upper()}_{timestamp}_{random_id}"

        return (
            f"[Agent Session: {agent_session}]\n"
            f"[Processing: {self.agent_type.value}]\n"
            f"[Timestamp: {datetime.now().isoformat()}]\n\n"
            + text
        )

    @staticmethod
    def _extract_json_from_text(text: str) -> Dict[str, Any]:
        """
        Robustly extract a JSON object from the model's plain-text response.

        This model (openai.gpt-oss-20b-1:0) emits chain-of-thought reasoning
        inside <reasoning>…</reasoning> or <think>…</think> tags BEFORE the
        actual JSON.  We strip those blocks first, then try to parse JSON.

        Extraction attempts (in order):
          1. Strip reasoning tags → bare JSON.
          2. Strip reasoning tags → fenced JSON (```json … ```).
          3. Strip reasoning tags → find outermost { … } block.
          4. Raw text → find outermost { … } block (fallback).
        """
        text = text.strip()

        # ── Step 0: remove chain-of-thought reasoning blocks ─────────────────
        # Pattern covers <reasoning>…</reasoning> and <think>…</think>
        cleaned = re.sub(r'<reasoning>[\s\S]*?</reasoning>', '', text).strip()
        cleaned = re.sub(r'<think>[\s\S]*?</think>',        '', cleaned).strip()

        def _try_parse(s: str) -> Optional[Dict[str, Any]]:
            s = s.strip()
            # Attempt A: the whole string is valid JSON
            try:
                return json.loads(s)
            except (json.JSONDecodeError, ValueError):
                pass

            # Attempt B: strip markdown code fences
            fence = re.search(r'```(?:json)?\s*\n?([\s\S]*?)\n?```', s)
            if fence:
                try:
                    return json.loads(fence.group(1).strip())
                except (json.JSONDecodeError, ValueError):
                    pass

            # Attempt C: find the outermost balanced { … } block
            brace_start = s.find('{')
            if brace_start != -1:
                depth = 0
                for i in range(brace_start, len(s)):
                    if s[i] == '{':
                        depth += 1
                    elif s[i] == '}':
                        depth -= 1
                    if depth == 0:
                        candidate = s[brace_start: i + 1]
                        try:
                            return json.loads(candidate)
                        except (json.JSONDecodeError, ValueError):
                            break
            return None

        # Try on cleaned text first (reasoning stripped), then raw text
        for source in (cleaned, text):
            result = _try_parse(source)
            if result is not None:
                return result

        raise ValueError(
            f"Could not extract valid JSON from model output. "
            f"First 400 chars of response: {text[:400]}"
        )

    async def process(
        self,
        input_text: str,
    ) -> AgentResult:
        """
        Extract one resume section via OpenAI chat completions.

        Strategy (no tool/function calling):
          1. Build a user message that embeds the required JSON schema as text.
          2. POST to OpenAI – request body: {"messages": [...], "max_tokens": N}
          3. Extract the model's plain-text output via OpenAIClient.extract_content().
          4. Parse the JSON with _extract_json_from_text() (handles fences, etc.).
          5. Apply existing normalisation / cleaning via _clean_extracted_data().
        """
        start_time = start_timing()

        # ── Short-circuit: no content to extract ─────────────────────────────
        # _prepare_agent_inputs sets input_text='' when it detects the resume
        # has zero cert-related content. Skip the LLM call entirely.
        if not input_text and self.agent_type == AgentType.CERTIFICATIONS:
            logger.info("ℹ️ Certifications Agent: Skipped — no cert content in resume")
            return AgentResult(
                agent_type=self.agent_type,
                data={'certifications': []},
                processing_time=0.0,
                success=True,
            )

        try:
            max_output = _AGENT_MAX_TOKENS[self.agent_type]

            logger.info(
                f"🤖 {self.agent_type.value.title()} Agent: Starting extraction "
                f"(Input: {len(input_text)} chars | max_tokens: {max_output})"
            )

            # ── Build the user message ────────────────────────────────────────
            # Combine:  session prefix | schema instructions | resume text
            schema_instructions = self._build_json_schema_prompt()
            resume_block = self._add_cache_variation(
                f"RESUME TEXT TO EXTRACT FROM:\n\n{input_text}"
            )
            user_message = f"{schema_instructions}\n\n{resume_block}"

            # ── OpenAI chat completions ───────────────────────────────────────
            # No 'tools' or 'tool_choice' – model is a pure text/JSON generator.
            response = await self.client.invoke(
                messages=[
                    {"role": "system", "content": self._get_system_prompt()},
                    {"role": "user",   "content": user_message},
                ],
                max_tokens=max_output,
            )

            processing_time = (datetime.now() - start_time).total_seconds()
            log_cache_analysis(response, self.agent_type.value)

            # ── Parse response ────────────────────────────────────────────────
            raw_text       = OpenAIClient.extract_content(response)
            extracted_data = self._extract_json_from_text(raw_text)

            # ── Certifications: run full pipeline before cleaning ─────────────
            # Pipeline: classify format → Python table extraction → merge LLM →
            # validate → normalize flat.  Table-sourced rows have zero
            # hallucination risk; they take priority over LLM results.
            if self.agent_type == AgentType.CERTIFICATIONS:
                flat_certs, fmt_type, fmt_conf = run_cert_extraction_pipeline(
                    input_text, extracted_data
                )
                extracted_data['certifications'] = flat_certs
                logger.info(
                    "[cert-pipeline] Format=%s conf=%d → %d cert(s)",
                    fmt_type, fmt_conf, len(flat_certs),
                )

            cleaned_data = self._clean_extracted_data(extracted_data, source_text=input_text)

            logger.info(
                f"✅ {self.agent_type.value.title()} Agent: Extraction successful "
                f"({processing_time:.2f}s)"
            )
            return AgentResult(
                agent_type=self.agent_type,
                data=cleaned_data,
                processing_time=processing_time,
                success=True,
            )

        except json.JSONDecodeError as e:
            logger.error(f"❌ {self.agent_type.value.title()} Agent: JSON parse error – {e}")
            return self._create_error_result(start_time, f"JSON parsing failed: {e}")

        except Exception as e:
            logger.error(f"❌ {self.agent_type.value.title()} Agent: Processing failed – {e}")
            return self._create_error_result(start_time, str(e))

    # ─────────────────────────────────────────────────────────────────────────
    # DATA CLEANING
    # ─────────────────────────────────────────────────────────────────────────

    def _clean_extracted_data(
        self,
        data: Dict[str, Any],
        source_text: str = "",
    ) -> Dict[str, Any]:
        """
        Clean bullet prefixes, run normalization functions, and apply all
        post-processing fixes.

        Args:
            data:        The raw dict parsed from the LLM JSON response.
            source_text: The original input text sent to this agent.
                         Used to populate rawTextBackup on low-confidence entries.

        Every loop that iterates over LLM-returned arrays guards with
        isinstance(..., dict) so a stray string entry never raises
        "'str' object has no attribute 'get'".
        """

        # ── SUMMARY ──────────────────────────────────────────────────────────
        if self.agent_type == AgentType.SUMMARY and data.get('professionalSummary'):
            # BUG 5 FIX: Split items that contain inline "•" separators
            # e.g. "Requirement Dev • Use Case Analysis • Project Mgmt"
            # must become three separate bullet entries.
            expanded: List[str] = []
            for item in data['professionalSummary']:
                if not isinstance(item, str):
                    continue
                if '\u2022' in item or ' • ' in item:
                    parts = re.split(r'\s*[•\u2022]\s*', item)
                    expanded.extend(p.strip() for p in parts if p.strip())
                else:
                    expanded.append(item)
            data['professionalSummary'] = [
                strip_bullet_prefix(item) for item in expanded
            ]
            if data.get('summarySections'):
                for section in data['summarySections']:
                    if not isinstance(section, dict):
                        continue
                    if section.get('content'):
                        section['content'] = [
                            strip_bullet_prefix(item)
                            for item in section['content']
                            if isinstance(item, str)
                        ]

        # ── EXPERIENCE ───────────────────────────────────────────────────────
        elif self.agent_type == AgentType.EXPERIENCE and data.get('employmentHistory'):

            # ── Type guard: ensure employmentHistory is a list ────────────────
            emp_history = data['employmentHistory']
            if isinstance(emp_history, str):
                logger.warning(
                    "[GUARD] employmentHistory is a string, not a list – discarding. "
                    "Value: %s", emp_history[:80]
                )
                data['employmentHistory'] = []
                emp_history = []
            elif isinstance(emp_history, dict):
                emp_history = [emp_history]
                data['employmentHistory'] = emp_history

            for job in emp_history:
                # Skip any entry that is not a dict
                if not isinstance(job, dict):
                    logger.warning(
                        "[GUARD] Skipping non-dict employmentHistory entry: %s → %s",
                        type(job).__name__, str(job)[:80]
                    )
                    continue

                # ── Normalise work period ─────────────────────────────────────
                if job.get('workPeriod'):
                    job['workPeriod'] = normalize_work_period(job['workPeriod'])

                # ── Location: extract from company name only when truly absent ─
                # Never guess a location; only extract from an embedded string.
                if not job.get('location') and job.get('companyName'):
                    extracted = extract_location_from_company_name(job['companyName'])
                    if extracted:
                        job['location'] = extracted
                        logger.info(
                            "[FIX 5c] Extracted location '%s' from company name '%s'",
                            extracted, job['companyName']
                        )

                if job.get('location'):
                    job['location'] = normalize_location(job['location'])

                # ── Responsibilities ──────────────────────────────────────────
                if job.get('responsibilities') and isinstance(job['responsibilities'], list):
                    job['responsibilities'] = sanitize_responsibilities([
                        strip_bullet_prefix(item)
                        for item in job['responsibilities']
                        if isinstance(item, str)
                    ])

                # ── Subsections ───────────────────────────────────────────────
                if job.get('subsections') and isinstance(job['subsections'], list):
                    for subsection in job['subsections']:
                        if not isinstance(subsection, dict):
                            continue
                        if subsection.get('content') and isinstance(subsection['content'], list):
                            subsection['content'] = [
                                strip_bullet_prefix(item)
                                for item in subsection['content']
                                if isinstance(item, str)
                            ]

                # ── Projects: normalise + validate ────────────────────────────
                if job.get('projects') and isinstance(job['projects'], list):
                    validated_projects: List[Dict[str, Any]] = []
                    for project in job['projects']:
                        if not isinstance(project, dict):
                            logger.warning(
                                "[GUARD] Skipping non-dict project entry: %s → %s",
                                type(project).__name__, str(project)[:80]
                            )
                            continue

                        # FIX #10: Validate project is not fabricated
                        pname = project.get('projectName', '')
                        if pname and not validate_project_not_fabricated(pname, source_text):
                            logger.warning(
                                "[FIX #10] Removing fabricated project '%s' "
                                "from '%s'", pname, job.get('companyName', '?')
                            )
                            continue  # drop hallucinated project

                        if project.get('period'):
                            project['period'] = normalize_work_period(project['period'])
                        if project.get('projectLocation'):
                            project['projectLocation'] = normalize_location(
                                project['projectLocation']
                            )
                        if project.get('projectResponsibilities') and isinstance(
                            project['projectResponsibilities'], list
                        ):
                            project['projectResponsibilities'] = sanitize_responsibilities([
                                strip_bullet_prefix(item)
                                for item in project['projectResponsibilities']
                                if isinstance(item, str)
                            ])

                        validated_projects.append(project)

                    job['projects'] = validated_projects

                # ── FIX #4: Clear job-level tech/resp when projects exist ─────
                enforce_tech_responsibility_rules(job)

                # ── FIX #3: Remove project periods = job workPeriod ──────────
                enforce_project_period_dedup(job)

                # ── Confidence scoring + rawTextBackup ────────────────────────
                confidence = score_employment_entry(job)
                job['_confidence'] = confidence
                if confidence < 0.80 and source_text:
                    job.setdefault('rawTextBackup', source_text[:2000])
                    logger.warning(
                        "[confidence] Low-confidence entry (%.2f) for '%s / %s' "
                        "— rawTextBackup populated.",
                        confidence, job.get('companyName'), job.get('roleName'),
                    )

            # ── Final list cleanup ────────────────────────────────────────────
            # Remove non-dict entries
            data['employmentHistory'] = [
                j for j in data['employmentHistory'] if isinstance(j, dict)
            ]

            # ── Deduplication ─────────────────────────────────────────────────
            data['employmentHistory'] = _deduplicate_employment_history(
                data['employmentHistory']
            )

            # ── Merge same-role entries (LLM split one role into N entries) ───
            data['employmentHistory'] = _merge_same_role_entries(
                data['employmentHistory']
            )

            # ── Pydantic schema validation pass ───────────────────────────────
            # Validates field types and logs warnings; does not mutate valid data.
            try:
                EmploymentHistoryOut(employmentHistory=data['employmentHistory'])
            except Exception as val_err:
                logger.warning("[validation] Employment schema validation: %s", val_err)

        # ── EDUCATION ────────────────────────────────────────────────────────
        elif self.agent_type == AgentType.EDUCATION and data.get('education'):
            for edu in data['education']:
                if not isinstance(edu, dict):
                    continue
                if edu.get('location'):
                    edu['location'] = normalize_location(edu['location'])
                if edu.get('date'):
                    edu['date'] = normalize_work_period(edu['date'])

        # ── SKILLS ───────────────────────────────────────────────────────────
        elif self.agent_type == AgentType.SKILLS and data.get('skillCategories'):
            for category in data['skillCategories']:
                if not isinstance(category, dict):
                    continue
                if not isinstance(category.get('subCategories'), list):
                    category['subCategories'] = []

        # ── CERTIFICATIONS ───────────────────────────────────────────────────
        elif self.agent_type == AgentType.CERTIFICATIONS:
            raw_certs = data.get('certifications', [])
            if not isinstance(raw_certs, list):
                raw_certs = []

            cleaned_certs: List[Dict[str, Any]] = []
            seen_names: set = set()

            for cert in raw_certs:
                if not isinstance(cert, dict):
                    continue

                # ── Repair field bleed + strip dashes / whitespace ────────────
                cert = extract_certification_fields(cert)

                # ── Skip entries with no usable name ─────────────────────────
                name = cert.get('name', '').strip()
                if not name:
                    logger.warning("[certifications] Dropping cert with empty name: %s", cert)
                    continue

                # ── Normalise dates ───────────────────────────────────────────
                if cert.get('dateObtained'):
                    cert['dateObtained'] = normalize_work_period(cert['dateObtained'])
                if cert.get('expirationDate'):
                    cert['expirationDate'] = normalize_work_period(cert['expirationDate'])

                # ── Ensure credentialUrl field exists ─────────────────────────
                cert.setdefault('credentialUrl', '')

                # ── Confidence scoring + rawTextBackup ────────────────────────
                confidence = score_certification_entry(cert)
                if confidence < 0.50 and source_text:
                    cert.setdefault('rawTextBackup', source_text[:1000])
                    logger.warning(
                        "[confidence] Low-confidence cert (%.2f) '%s' "
                        "— rawTextBackup populated.", confidence, name
                    )

                # ── Deduplicate by normalised name ────────────────────────────
                norm_key = name.lower()
                if norm_key in seen_names:
                    logger.info("[certifications] Deduplicating cert: '%s'", name)
                    continue
                seen_names.add(norm_key)

                cleaned_certs.append(cert)

            data['certifications'] = cleaned_certs

            # ── Pydantic schema validation pass ───────────────────────────────
            try:
                CertificationsOut(certifications=data['certifications'])
            except Exception as val_err:
                logger.warning("[validation] Certification schema validation: %s", val_err)


        return data

    def _create_error_result(
        self,
        start_time: datetime,
        error_message: str
    ) -> AgentResult:
        processing_time = (datetime.now() - start_time).total_seconds()
        return AgentResult(
            agent_type=self.agent_type,
            data={},
            processing_time=processing_time,
            success=False,
            error_message=error_message,
        )


# ─────────────────────────────────────────────────────────────────────────────
# MULTI-AGENT ORCHESTRATOR
# ─────────────────────────────────────────────────────────────────────────────

class MultiAgentResumeProcessor:
    """
    Orchestrates multiple specialized agents for parallel resume processing.
    """

    def __init__(self, client: OpenAIClient):
        self.client = client

    async def process_resume_with_agents(
        self,
        raw_text: str,
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Process resume using multiple specialized agents in parallel."""
        logger.info("Starting resume processing...")

        try:
            from .chunk_resume import chunk_resume_from_bold_headings

            # Chunk the resume
            sections = chunk_resume_from_bold_headings(raw_text)

            if 'error' in sections:
                logger.warning(
                    f"Chunking failed: {sections['error']} – "
                    "using full resume for all agents"
                )
                sections = {}

            # ✅ FIX #9: Reorder sections to standard order
            if sections:
                sections = reorder_sections_to_standard(sections)

            # Create all agents
            agents = [
                ResumeAgent(self.client, AgentType.HEADER),
                ResumeAgent(self.client, AgentType.SUMMARY),
                ResumeAgent(self.client, AgentType.EXPERIENCE),
                ResumeAgent(self.client, AgentType.EDUCATION),
                ResumeAgent(self.client, AgentType.SKILLS),
                ResumeAgent(self.client, AgentType.CERTIFICATIONS),
            ]

            # Prepare inputs for each agent
            agent_inputs = self._prepare_agent_inputs(agents, sections, raw_text)

            # Run all agents in parallel – model is configured inside OpenAIClient
            agent_tasks = [
                agent.process(agent_inputs['inputs'][agent.agent_type])
                for agent in agents
            ]
            results = await asyncio.gather(*agent_tasks, return_exceptions=True)

            successful_results = []
            failed_agents = []

            for result in results:
                if isinstance(result, Exception):
                    logger.error(f"Agent task raised exception: {result}")
                    failed_agents.append(str(result))
                    continue
                if result.success:
                    successful_results.append(result)
                else:
                    failed_agents.append(
                        f"{result.agent_type.value}: {result.error_message}"
                    )

            if failed_agents:
                logger.warning(f"Some agents failed: {failed_agents}")

            combined_data = self._combine_agent_results(successful_results)

            yield {
                'type': 'final_data',
                'data': combined_data,
                'timestamp': datetime.now().isoformat(),
            }

        except Exception as e:
            logger.error(f"Resume processing failed: {e}")
            yield {
                'type': 'error',
                'message': f'Resume processing failed: {str(e)}',
                'timestamp': datetime.now().isoformat(),
            }

    def _prepare_agent_inputs(
        self,
        agents: List[ResumeAgent],
        sections: Dict[str, str],
        raw_text: str,
    ) -> Dict[str, Any]:
        """Prepare intelligent inputs for each agent based on chunked sections."""
        agent_inputs: Dict[AgentType, str] = {}
        strategy: Dict[str, str] = {}

        section_mapping = {
            AgentType.HEADER:         'header',
            AgentType.SUMMARY:        'summary',
            AgentType.EXPERIENCE:     'experience',
            AgentType.EDUCATION:      'education',
            AgentType.SKILLS:         'skills',
            AgentType.CERTIFICATIONS: 'certifications',
        }

        for agent in agents:
            at = agent.agent_type
            key = section_mapping[at]

            # Certifications: prefer the chunked section; fall back to a
            # targeted slice; if the resume truly has no cert content at all,
            # skip the LLM entirely and return empty certifications.
            if at == AgentType.CERTIFICATIONS:
                cert_chunk = sections.get('certifications', '')
                if isinstance(cert_chunk, str):
                    cert_chunk = cert_chunk.strip()

                if cert_chunk:
                    agent_inputs[at] = cert_chunk
                    strategy[at.value] = 'chunked_section'
                    logger.info(
                        f"✅ Certifications Agent: Using chunked section "
                        f"({len(cert_chunk)} chars)"
                    )
                else:
                    extracted = _extract_cert_text(raw_text)
                    if extracted != raw_text:
                        # Found a cert heading — use the extracted slice only
                        agent_inputs[at] = extracted
                        strategy[at.value] = 'cert_section_extracted'
                        logger.info(
                            f"✅ Certifications Agent: Extracted cert section "
                            f"({len(extracted)} chars)"
                        )
                    else:
                        # Full resume fallback — check if ANY cert-like keyword
                        # exists before sending to LLM. If not, skip entirely.
                        _CERT_KEYWORD_RE = re.compile(
                            r'\b(?:certif(?:ied|ication|icate)s?|licen[sc]e[ds]?|credential)\b',
                            re.IGNORECASE,
                        )
                        if _CERT_KEYWORD_RE.search(raw_text):
                            agent_inputs[at] = raw_text
                            strategy[at.value] = 'full_resume_fallback'
                            logger.warning(
                                "⚠️ Certifications Agent: No cert section found — "
                                f"sending full resume ({len(raw_text)} chars)"
                            )
                        else:
                            # Resume has zero cert content — skip LLM call
                            agent_inputs[at] = ''
                            strategy[at.value] = 'skipped_no_cert_content'
                            logger.info(
                                "ℹ️ Certifications Agent: No certification "
                                "content detected — skipping LLM call"
                            )
                continue

            if key in sections and sections.get(key) and sections[key].strip():
                chunked = sections[key].strip()

                if at == AgentType.HEADER:
                    # Give header agent additional context from the top of the file
                    context = raw_text[:1000]
                    agent_inputs[at] = (
                        f"{context}\n\n--- HEADER SECTION ---\n{chunked}"
                    )
                    strategy[at.value] = 'chunked_with_context'
                else:
                    agent_inputs[at] = chunked
                    strategy[at.value] = 'chunked_section'

                logger.info(
                    f"✅ {at.value.title()} Agent: Using chunked section "
                    f"({len(chunked)} chars)"
                )
            else:
                agent_inputs[at] = raw_text
                strategy[at.value] = 'full_resume_fallback'
                logger.info(
                    f"⚠️ {at.value.title()} Agent: Section missing/empty, "
                    "using full resume"
                )

        return {'inputs': agent_inputs, 'strategy': strategy}

    def _combine_agent_results(
        self,
        results: List[AgentResult],
    ) -> Dict[str, Any]:
        """Merge results from all agents into a single resume data structure."""
        combined: Dict[str, Any] = {
            'name': '',
            'title': '',
            'requisitionNumber': '',
            'professionalSummary': [],
            'summarySections': [],
            'subsections': [],
            'employmentHistory': [],
            'education': [],
            'certifications': [],
            'technicalSkills': {},
            'skillCategories': [],
        }

        header_title = ''
        summary_title = ''

        for result in results:
            d = result.data

            if result.agent_type == AgentType.HEADER:
                header_title = (d.get('title') or '').strip()
                raw_name = (d.get('name') or '').strip()
                # ✅ FIX #8: normalize_person_name now applies title-casing
                cleaned_name = normalize_person_name(raw_name)
                combined.update({
                    'name': cleaned_name or raw_name,
                    'requisitionNumber': d.get('requisitionNumber', ''),
                })

            elif result.agent_type == AgentType.SUMMARY:
                summary_title = (d.get('title') or '').strip()
                combined.update({
                    'professionalSummary': d.get('professionalSummary', []),
                    'summarySections':     d.get('summarySections', []),
                })
                combined['subsections'] = combined['summarySections']

            elif result.agent_type == AgentType.EXPERIENCE:
                combined['employmentHistory'] = d.get('employmentHistory', [])

            elif result.agent_type == AgentType.EDUCATION:
                combined['education'] = d.get('education', [])

            elif result.agent_type == AgentType.SKILLS:
                combined.update({
                    'technicalSkills':  d.get('technicalSkills', {}),
                    'skillCategories':  d.get('skillCategories', []),
                })

            elif result.agent_type == AgentType.CERTIFICATIONS:
                combined['certifications'] = d.get('certifications', [])

        # Resolve title from header vs summary agents
        def _norm(v: str) -> str:
            return re.sub(r'\s+', ' ', (v or '').strip()).lower()

        n_header  = _norm(header_title)
        n_summary = _norm(summary_title)

        if n_header and n_summary:
            combined['title'] = (
                header_title if n_header == n_summary else ''
            )
        else:
            combined['title'] = header_title or summary_title or ''

        logger.info(f"✅ Combined data from {len(results)} agents successfully")
        return combined