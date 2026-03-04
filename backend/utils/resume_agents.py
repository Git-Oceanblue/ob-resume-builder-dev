

import asyncio
import json
import logging
import os
import re
from datetime import datetime
from typing import Dict, List, Any, Optional, AsyncGenerator
from dataclasses import dataclass
from enum import Enum

from dotenv import load_dotenv, find_dotenv
from .openai_client import OpenAIClient
from .agent_schemas import ResumeAgentSchemas
from .token_logger import start_timing, log_cache_analysis
from .chunk_resume import strip_bullet_prefix

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


def sanitize_responsibilities(items: list) -> list:
    """Apply remove_vendor_names() to every bullet in a responsibility list."""
    return [remove_vendor_names(item) for item in items if isinstance(item, str)]


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
    FIX #4: If a job has projects, forcibly clear job-level keyTechnologies
    and responsibilities to prevent duplicate data in the final resume.
    """
    has_projects = bool(job.get('projects'))

    if has_projects:
        if job.get('keyTechnologies'):
            logger.warning(
                f"[FIX #4] Projects exist for '{job.get('companyName', '?')}' "
                "but keyTechnologies is still filled → clearing."
            )
            job['keyTechnologies'] = ""

        if job.get('responsibilities'):
            logger.warning(
                f"[FIX #4] Projects exist for '{job.get('companyName', '?')}' "
                "but responsibilities is still filled → clearing."
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


def validate_project_not_fabricated(
    project_name: str,
    job_text: str
) -> bool:
    """
    FIX #10: Detect projects that were invented by the LLM from general
    responsibilities rather than extracted from explicitly named projects.

    Returns True if the project appears to be explicitly mentioned,
    False if it looks fabricated.
    """
    if not project_name or not job_text:
        return False

    job_text_lower = job_text.lower()
    project_name_lower = project_name.lower()

    # Extract the actual project title between "Project N:" and the optional "/ Role"
    name_match = re.search(r'project\s+\d+:\s*(.+?)(?:\s*/\s*.+)?$',
                           project_name_lower)
    if not name_match:
        # If it doesn't even follow the format, flag it
        logger.warning(
            f"[FIX #10] Project name does not follow 'Project N: ...' format: "
            f"'{project_name}'"
        )
        return False

    actual_name = name_match.group(1).strip()

    # Split into meaningful terms (> 3 chars)
    terms = [t for t in re.split(r'\W+', actual_name) if len(t) > 3]
    if not terms:
        return False

    found = sum(1 for t in terms if t in job_text_lower)
    confidence = found / len(terms)

    if confidence < 0.5:
        logger.warning(
            f"[FIX #10] Project looks FABRICATED (score {confidence:.2f}): "
            f"'{project_name}'"
        )
        return False

    logger.debug(
        f"[FIX #10] Project validated (score {confidence:.2f}): '{project_name}'"
    )
    return True


_DASH_RE = re.compile(r'^\s*-+\s*$')


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
    AgentType.EXPERIENCE:     16384,
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
                "complete details. Missing any job is unacceptable.\n\n"
                "RESUME FORMAT: Job entries follow this structure:\n"
                "  Company Name | Date Range\n"
                "  Role Title | Location\n"
                "  Project Name (explicit sub-project title)\n"
                "  'Responsibilities'\n"
                "  • Bullet points (responsibilities + inline tech mentions)\n\n"
                "CRITICAL PROJECT EXTRACTION RULES:\n"
                "• ONLY include 'projects' if the resume explicitly names specific projects.\n"
                "• When projects exist, job-level 'responsibilities' and 'keyTechnologies' "
                "  MUST be empty – all detail lives in the project objects.\n"
                "• Number projects in DESCENDING order (most recent = highest number).\n"
                "• Extract ALL projects – missing a project is a data-loss error.\n\n"
                "TECHNOLOGY EXTRACTION RULE (CRITICAL):\n"
                "• STEP 1 — Explicit label (highest priority): Look for a line that begins\n"
                "  with 'Technologies:', 'Tools & Technologies:', 'Key Technologies/Skills:',\n"
                "  or similar. If found, copy the COMPLETE comma-separated list exactly as\n"
                "  written — do NOT omit or alter any item, including vendor/tool names\n"
                "  such as Gearset, Conga, MuleSoft, Copado, Azure, Jest, Mocha, etc.\n"
                "• STEP 2 — Bullet inference (fallback only): Only when NO explicit\n"
                "  Technologies label exists, infer technologies by scanning responsibility\n"
                "  bullets for tool/platform/language names.\n"
                "• IMPORTANT: The VENDOR NAME RULE below applies ONLY to responsibility\n"
                "  bullet text — NEVER remove vendor names from keyTechnologies.\n"
                "• Populate keyTechnologies at project level (if a named project exists)\n"
                "  or at job level (if no projects). NEVER leave both empty when\n"
                "  responsibilities or a Technologies label exist.\n\n"
                "LOCATION RULE:\n"
                "• If role location is not listed separately, check if it is embedded "
                "  in the company name (e.g. 'IBM India Pvt Ltd, Hyderabad, India').\n"
                "• Extract city and country from company name when needed.\n"
                "• India format: 'India'. USA format: 'ST'.\n\n"
                "VENDOR NAME RULE (responsibility bullets only):\n"
                "• Remove third-party vendor brand names (Gearset, Conga, MuleSoft, Copado) "
                "  from responsibility bullet text where they appear after 'using', 'via', 'i.e'. "
                "  Replace or omit the vendor name, keeping the sentence meaningful.\n"
                "• This rule applies ONLY to responsibility/bullet text. Vendor names in a\n"
                "  Technologies/Tools label MUST be preserved in keyTechnologies."
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
                "TASK: Extract ONLY certifications, licenses, and professional credentials "
                "that are EXPLICITLY present in the text. Think step-by-step.\n\n"
                "CONSTRAINTS (strictly enforced):\n"
                "• Do NOT infer, guess, or hallucinate certifications.\n"
                "• Do NOT extract skills, degrees, awards, or job titles.\n"
                "• Do NOT merge content from other resume sections.\n"
                "• Do NOT invent issuing institutions — only extract if explicitly stated.\n"
                "• If no certifications are present, return an empty array.\n\n"
                "TABLE FORMAT: The text may contain TABLE COLUMN HEADERS such as:\n"
                "  'Certification', 'Issued By', 'Date Obtained (MM/YY)',\n"
                "  'Certification Number (If Applicable)', 'Expiration Date (If Applicable)'\n"
                "  These are LAYOUT LABELS — SKIP them entirely.\n\n"
                "DASH / EMPTY HANDLING:\n"
                "• A '-' or '--' in any field means NOT PROVIDED. Use \"\" not \"-\".\n"
                "• Blank or whitespace-only values must also be returned as \"\".\n\n"
                "COMMA-SEPARATED CERTS: If multiple certifications appear on one line "
                "separated by commas (e.g. 'Cert A, Cert B'), split into separate objects.\n\n"
                "FIELD RULES:\n"
                "• 'name'  — certification title ONLY. No issuer, no dates, no ID numbers.\n"
                "• 'issuedBy' — issuing organisation only if explicitly stated; else \"\".\n"
                "• 'dateObtained' — use MMM YYYY format; \"\" if not stated.\n"
                "• 'certificationNumber' — ID/number if explicitly given; else \"\".\n"
                "• 'expirationDate' — use MMM YYYY format; \"\" if not stated.\n\n"
                "DUPLICATE HANDLING: If the same certification appears more than once "
                "(e.g. in both a table row and a list), include it only once.\n\n"
                "INTERNAL REASONING (before producing JSON, think through):\n"
                "1. Which certifications are explicitly present?\n"
                "2. Are they real or hallucinated?\n"
                "3. Are they tied to an institution?\n"
                "4. Are there duplicates or formatting artifacts?\n"
                "5. Does the final JSON match the required schema?"
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
      "companyName": "<company name>",
      "roleName": "<job title>",
      "workPeriod": "<MMM YYYY - MMM YYYY>  or  <MMM YYYY - Till Date>",
      "location": "<City, ST>  or  <City, Country>  (e.g. Dallas, TX  /  Hyderabad, India)",
      "projects": [
        {
          "projectName": "<Project N: ProjectTitle / Role>  e.g. Project 3: Portal Migration / Developer",
          "projectLocation": "<City, Country or empty string>",
          "projectResponsibilities": ["<bullet 1>", "<bullet 2>", "... ALL bullets"],
          "projectDescription": "<one-sentence description>",
          "keyTechnologies": "<Tech1, Tech2, Tech3 – infer from bullets if no explicit label>",
          "period": "<MMM YYYY - MMM YYYY or empty string if same as job period>"
        }
      ],
      "responsibilities": [],
      "keyTechnologies": "",
      "subsections": []
    }
  ]
}

RULES (strictly enforced):
• Include ALL jobs – missing even one is unacceptable.
• Jobs with explicit named projects → projects=[...], responsibilities=[], keyTechnologies=""
• Jobs WITHOUT explicit named projects → projects=[], responsibilities=[...all bullets], keyTechnologies="Tech1, Tech2"
• Number projects DESCENDING (most recent = highest number).
• workPeriod format: 'MMM YYYY - MMM YYYY' or 'MMM YYYY - Till Date' (3-letter months only).
• Location format: 'City, ST' (USA) or 'City, Country' (other).  India → 'City, India' only.""",

            AgentType.EDUCATION: """\
Return ONLY this JSON object (no other text):
{
  "education": [
    {
      "degree": "<BS | MS | MBA | MA | MCom | PhD | JD | AA | AS>",
      "areaOfStudy": "<field of study>",
      "school": "<institution name only – no location>",
      "location": "<City, ST>  or  <City, Country>",
      "date": "<May 2019>  or  <2015 - 2019>",
      "wasAwarded": true
    }
  ]
}

STANDARDISATION (mandatory):
• BTech / BE / BCom / BA / Bachelor of ... → "BS"
• MTech / ME / Master of Technology / Master of Engineering → "MS"
• MBA → "MBA"   MA → "MA"   PhD / Doctorate → "PhD"
Sort entries ascending by degree level: BS → MS → MBA → PhD.""",

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
      "expirationDate": "<MMM YYYY if stated, else empty string>"
    }
  ]
}

CRITICAL RULES:
• Return ONLY certifications explicitly present – never hallucinate.
• Do NOT output skills, degrees, awards, or job titles.
• Skip table column header lines: Certification, Issued By, Date Obtained, etc.
• A dash (-) or blank means the field is empty – always use "" not "-".
• Comma-separated certs on one line must be split into separate objects.
• Deduplicate: if the same cert appears twice, include it once only.
• Each certification is a separate object in the array.
• ONLY the credential title goes in "name" – no other data.
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
            # extract_content() parses the normalised OpenAI response dict
            raw_text      = OpenAIClient.extract_content(response)
            extracted_data = self._extract_json_from_text(raw_text)
            cleaned_data   = self._clean_extracted_data(extracted_data)

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

    def _clean_extracted_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Clean bullet prefixes, run normalization functions, and apply all
        post-processing fixes.

        Every loop that iterates over LLM-returned arrays guards with
        isinstance(..., dict) so a stray string entry never raises
        "'str' object has no attribute 'get'".
        """

        # ── SUMMARY ──────────────────────────────────────────────────────────
        if self.agent_type == AgentType.SUMMARY and data.get('professionalSummary'):
            data['professionalSummary'] = [
                strip_bullet_prefix(item)
                for item in data['professionalSummary']
                if isinstance(item, str)
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

            # Ensure employmentHistory is actually a list; wrap a stray dict;
            # discard if the LLM returned a plain string.
            emp_history = data['employmentHistory']
            if isinstance(emp_history, str):
                logger.warning(
                    "[GUARD] employmentHistory is a string, not a list – discarding. "
                    f"Value: {emp_history[:80]}"
                )
                data['employmentHistory'] = []
                emp_history = []
            elif isinstance(emp_history, dict):
                emp_history = [emp_history]
                data['employmentHistory'] = emp_history

            for job in emp_history:
                # Guard: skip any entry that is not a dict
                if not isinstance(job, dict):
                    logger.warning(
                        f"[GUARD] Skipping non-dict employmentHistory entry: "
                        f"{type(job).__name__} → {str(job)[:80]}"
                    )
                    continue

                # Normalise work period
                if job.get('workPeriod'):
                    job['workPeriod'] = normalize_work_period(job['workPeriod'])

                # FIX 5c: If location is missing, try extracting from company name
                # e.g. "IBM India Pvt Ltd, Hyderabad, India" → "Hyderabad, India"
                if not job.get('location') and job.get('companyName'):
                    extracted = extract_location_from_company_name(job['companyName'])
                    if extracted:
                        job['location'] = extracted
                        logger.info(
                            f"[FIX 5c] Extracted location '{extracted}' from "
                            f"company name '{job['companyName']}'"
                        )

                # Normalise location
                if job.get('location'):
                    job['location'] = normalize_location(job['location'])

                # Strip bullet prefixes from responsibilities
                if job.get('responsibilities') and isinstance(job['responsibilities'], list):
                    job['responsibilities'] = sanitize_responsibilities([
                        strip_bullet_prefix(item)
                        for item in job['responsibilities']
                        if isinstance(item, str)
                    ])

                # Normalise subsections
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

                # Normalise projects
                if job.get('projects') and isinstance(job['projects'], list):
                    for project in job['projects']:
                        # Guard: skip non-dict project entries
                        if not isinstance(project, dict):
                            logger.warning(
                                f"[GUARD] Skipping non-dict project entry: "
                                f"{type(project).__name__} → {str(project)[:80]}"
                            )
                            continue
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

                # Strip non-dict projects from the list before calling enforce functions
                if isinstance(job.get('projects'), list):
                    job['projects'] = [p for p in job['projects'] if isinstance(p, dict)]

                # ✅ FIX #4: Clear job-level tech/responsibilities when projects exist
                enforce_tech_responsibility_rules(job)

                # ✅ FIX #3: Remove project periods duplicated from job workPeriod
                enforce_project_period_dedup(job)

            # Remove any non-dict entries from the final list so downstream
            # code never receives a string where a job dict is expected.
            data['employmentHistory'] = [
                j for j in data['employmentHistory'] if isinstance(j, dict)
            ]

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

            cleaned_certs = []
            seen_names: set = set()

            for cert in raw_certs:
                if not isinstance(cert, dict):
                    continue

                # Repair field bleed + strip dashes / whitespace
                cert = extract_certification_fields(cert)

                # Skip entries with no usable name after cleaning
                name = cert.get('name', '').strip()
                if not name:
                    logger.warning("[certifications] Dropping cert with empty name: %s", cert)
                    continue

                # Normalise dates (after field repair, values are already clean strings)
                if cert.get('dateObtained'):
                    cert['dateObtained'] = normalize_work_period(cert['dateObtained'])
                if cert.get('expirationDate'):
                    cert['expirationDate'] = normalize_work_period(cert['expirationDate'])

                # Deduplicate by normalised name (case-insensitive)
                norm_key = name.lower()
                if norm_key in seen_names:
                    logger.info("[certifications] Deduplicating cert: '%s'", name)
                    continue
                seen_names.add(norm_key)

                cleaned_certs.append(cert)

            data['certifications'] = cleaned_certs

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

            # Certifications always get the full resume for best recall
            if at == AgentType.CERTIFICATIONS:
                agent_inputs[at] = raw_text
                strategy[at.value] = 'full_resume_always'
                logger.info(
                    f"🔍 {at.value.title()} Agent: Using full resume (certification rule)"
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