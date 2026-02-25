import re
import logging
from typing import Dict, List, Optional, Any

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# CONSTANTS
# ─────────────────────────────────────────────────────────────────────────────

DEFAULT_SECTIONS = [
    "header", "summary", "experience",
    "education", "skills", "certifications"
]

WORK_DATE_RANGE_PATTERN = re.compile(
    r"(?i)\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|"
    r"jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|"
    r"dec(?:ember)?)\s+(?:19|20)\d{2}\s*[-–—]\s*"
    r"(?:present|current|till\s+date|"
    r"(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|"
    r"jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|"
    r"dec(?:ember)?)\s+(?:19|20)\d{2})\b"
)

# Detects a job-entry header line such as:
#   "Salesforce Developer at DigitalBizTech (Jan 2022 - Jan 2024)"
# Used by _rescue_jobs_from_skills_chunk to find misclassified experience blocks.
_JOB_ROLE_IN_NON_EXPERIENCE_PATTERN = re.compile(
    r"^(?![●•\u2022\u2023\u25E6\u2043\u2219\u00B7\u25CF\-\*\s])"
    r"[A-Za-z][A-Za-z ,/]+?\s+at\s+[A-Za-z0-9][A-Za-z0-9 ,\.]+?"
    r"\s*\(\s*"
    r"(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|"
    r"jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|"
    r"dec(?:ember)?)\s+(?:19|20)\d{2}",
    re.IGNORECASE | re.MULTILINE,
)

SECTION_HEADER_ALIASES = {
    "summary": [
        "summary",
        "professional summary",
        "profile",
        "professional profile",
        "career summary",
        "summary of qualifications",
        "objective",
        "career objective",
    ],
    "experience": [
        "experience",
        "job experience",
        "work experience",
        "professional experience",
        "employment history",
        "job history",
        "work history",
    ],
    "education": [
        "education",
        "academic background",
        "educational background",
        "qualifications",
    ],
    "skills": [
        "skills",
        "skill set",
        "technical skills",
        "technical skill set",
        "technical proficiency",
        "technical proficiencies",
        "key skills",
        "core competencies",
        "competencies",
        "skills summary",
    ],
    "certifications": [
        "certifications",
        "certification",
        "technical certifications",
        "technical certification",
        "licenses",
        "certificates",
        "professional certifications",
    ],
}

# ─────────────────────────────────────────────────────────────────────────────
# FIX #9: Standard section reordering
# ─────────────────────────────────────────────────────────────────────────────

_STANDARD_SECTION_ORDER = [
    "header", "summary", "experience",
    "education", "skills", "certifications",
]
_META_KEYS = frozenset({"integrity_check", "integrity_warning", "Uncategorized"})


def reorder_sections_to_standard(sections: Dict[str, Any]) -> Dict[str, Any]:
    """
    FIX #9: Reorder a chunked-sections dict to the canonical resume ordering:
        header → summary → experience → education → skills → certifications

    Any sections not in the standard list are appended after in their original
    relative order. Metadata keys (integrity_check, etc.) are preserved last.
    """
    content_keys = [k for k in sections if k not in _META_KEYS]
    original_content_order = list(content_keys)

    reordered: Dict[str, Any] = {}

    # 1. Add standard-order sections first
    for key in _STANDARD_SECTION_ORDER:
        if key in sections:
            reordered[key] = sections[key]

    # 2. Add any non-standard content sections that weren't handled above
    for key in original_content_order:
        if key not in reordered:
            reordered[key] = sections[key]

    # 3. Preserve metadata keys at the end
    for key in _META_KEYS:
        if key in sections:
            reordered[key] = sections[key]

    new_content_order = [k for k in reordered if k not in _META_KEYS]
    if original_content_order != new_content_order:
        logger.info(
            f"[FIX #9] Sections reordered: {original_content_order} → {new_content_order}"
        )

    return reordered


# ─────────────────────────────────────────────────────────────────────────────
# MAIN CHUNKING FUNCTION
# ─────────────────────────────────────────────────────────────────────────────

def chunk_resume_from_bold_headings(
    raw_text: str,
    expected_sections: Optional[List[str]] = None
) -> Dict[str, Any]:

    if raw_text is None:
        raw_text = ""

    expected_sections = expected_sections or DEFAULT_SECTIONS

    output: Dict[str, Optional[str]] = {
        sec: None for sec in expected_sections if sec != "header"
    }
    header_text: Optional[str] = None

    matches = _detect_headers(
        raw_text,
        expected_sections=[s for s in expected_sections if s != "header"]
    )

    # No sections found → Uncategorized
    if not matches:
        unc = raw_text.strip()
        result: Dict[str, Any] = {
            "Uncategorized": unc if unc else None,
            "integrity_check": {
                "Uncategorized": {
                    "raw_chars": len(raw_text),
                    "extracted_chars": len(unc),
                    "status": "ok" if len(unc) == len(raw_text.strip()) else "warn",
                }
            },
        }
        if result["integrity_check"]["Uncategorized"]["status"] != "ok":
            result["integrity_warning"] = [
                "Uncategorized extraction differs from trimmed raw text length "
                "(expected due to trimming)."
            ]
        print(result)
        return result

    # Sort + dedup
    matches = sorted(matches, key=lambda m: m["line_start"])
    matches = _dedupe_matches(matches)

    # Infer experience start when header is absent but job date ranges exist
    if "experience" in expected_sections and not any(
        m["section_key"] == "experience" for m in matches
    ):
        inferred = _infer_experience_match(raw_text, matches)
        if inferred:
            matches.append(inferred)
            matches = sorted(matches, key=lambda m: m["line_start"])
            matches = _dedupe_matches(matches)
            logger.info("Inferred experience section from job-date patterns.")

    first = matches[0]
    header_slice = raw_text[: first["line_start"]]
    header_text = header_slice.strip()

    if "header" in expected_sections:
        output_header = header_text if header_text else None
    else:
        output_header = None

    section_slices: Dict[str, List[str]] = {}
    integrity_check: Dict[str, Dict[str, Any]] = {}
    integrity_warnings: List[str] = []

    for i, m in enumerate(matches):
        sec = m["section_key"]
        start = m["content_start"]
        end = matches[i + 1]["line_start"] if i + 1 < len(matches) else len(raw_text)

        raw_slice = raw_text[start:end]
        extracted = raw_slice.strip()
        if extracted:
            section_slices.setdefault(sec, []).append(extracted)

        raw_trim = raw_slice.strip()
        status = "ok" if len(extracted) == len(raw_trim) else "warn"
        existing = integrity_check.get(sec, {
            "raw_slice_chars": 0,
            "raw_slice_trimmed_chars": 0,
            "extracted_chars": 0,
            "segment_count": 0,
            "status": "ok",
        })
        existing["raw_slice_chars"] += len(raw_slice)
        existing["raw_slice_trimmed_chars"] += len(raw_trim)
        existing["extracted_chars"] += len(extracted)
        existing["segment_count"] += 1
        if existing["status"] == "ok" and status != "ok":
            existing["status"] = "warn"
        integrity_check[sec] = existing

        if status != "ok":
            integrity_warnings.append(
                f"{sec}: extracted_chars({len(extracted)}) != "
                f"raw_slice_trimmed_chars({len(raw_trim)}). "
                "Possible boundary mismatch."
            )

    for sec in expected_sections:
        if sec == "header":
            continue
        chunks = section_slices.get(sec, [])
        output[sec] = "\n\n".join(chunks) if chunks else None

    result: Dict[str, Any] = {}
    if "header" in expected_sections:
        result["header"] = output_header
    for sec in expected_sections:
        if sec == "header":
            continue
        result[sec] = output.get(sec)

    result["integrity_check"] = integrity_check
    if integrity_warnings:
        result["integrity_warning"] = integrity_warnings

    # ✅ RESCUE: Move misclassified job entries from skills → experience.
    # Handles resumes where a 'Skills' heading appears between experience entries,
    # causing older jobs to be absorbed into the skills chunk.
    result = _rescue_jobs_from_skills_chunk(result)

    # ✅ FIX #9: Apply standard section ordering before returning
    result = reorder_sections_to_standard(result)
    print(result)
    return result


# ─────────────────────────────────────────────────────────────────────────────
# INTERNAL HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _detect_headers(
    raw_text: str,
    expected_sections: List[str]
) -> List[Dict[str, Any]]:
    """
    Strict-but-flexible header detection:
      - Matches only standalone heading lines
      - Supports common resume heading aliases
    This prevents false splits like 'Certified Professional Scrum Master ...'
    """
    bullet_chars = r"\u2022\u2023\u25E6\u2043\u2219\u00B7"
    line_prefix = (
        rf"\s*(?:\*{{1,2}}\s*)?(?:[-*{bullet_chars}]+\s*)?(?:\d+\s*[\.\)]\s*)?"
    )

    section_patterns: List[Dict[str, Any]] = []
    for sec in expected_sections:
        aliases = SECTION_HEADER_ALIASES.get(sec, [sec])
        alias_pattern = "|".join(
            re.escape(alias.strip())
            for alias in aliases
            if alias and alias.strip()
        )
        if not alias_pattern:
            continue

        section_patterns.append({
            "section_key": sec,
            "standalone": re.compile(
                rf"^{line_prefix}(?:{alias_pattern})\s*(?:[:|\-])?(?:\s*\*{{1,2}})?\s*$",
                re.IGNORECASE,
            ),
            "inline": re.compile(
                rf"^{line_prefix}(?:{alias_pattern})\s*[:|\-]\s*"
                rf"(?P<content>\S.*?)(?:\s*\*{{1,2}})?\s*$",
                re.IGNORECASE,
            ),
        })

    matches = []
    pos = 0
    for line in raw_text.splitlines(keepends=True):
        line_start = pos
        line_end = pos + len(line)
        line_no_newline = line.rstrip("\r\n")

        for pattern_info in section_patterns:
            inline_match = pattern_info["inline"].match(line_no_newline)
            if inline_match:
                matches.append({
                    "section_key":   pattern_info["section_key"],
                    "line_start":    line_start,
                    "line_end":      line_end,
                    "content_start": line_start + inline_match.start("content"),
                })
                break

            if pattern_info["standalone"].match(line_no_newline):
                matches.append({
                    "section_key":   pattern_info["section_key"],
                    "line_start":    line_start,
                    "line_end":      line_end,
                    "content_start": line_end,
                })
                break

        pos = line_end

    if matches:
        logger.info(
            f"Detected {len(matches)} headers: "
            + ", ".join(m["section_key"] for m in matches)
        )
    else:
        logger.info("No strict section headers detected.")

    return matches


def _dedupe_matches(matches: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Remove duplicates/overlaps. Keep earliest match when overlaps occur."""
    if not matches:
        return []

    out = [matches[0]]
    for m in matches[1:]:
        prev = out[-1]
        if m["line_start"] < prev["line_end"]:
            continue
        if (
            m["section_key"] == prev["section_key"]
            and (m["line_start"] - prev["line_start"]) < 5
        ):
            continue
        out.append(m)

    return out


def _infer_experience_match(
    raw_text: str,
    matches: List[Dict[str, Any]]
) -> Optional[Dict[str, Any]]:
    """
    Infer experience section when explicit header is missing.
    Uses common employment date-range patterns (e.g. 'Aug 2024 - Current').
    """
    if not matches:
        return None

    if not any(m["section_key"] in {"skills", "education"} for m in matches):
        return None

    lower_bound = min(m["line_end"] for m in matches)
    trailing_bounds = [
        m["line_start"]
        for m in matches
        if m["section_key"] in {"education", "certifications"}
    ]
    upper_bound = min(trailing_bounds) if trailing_bounds else len(raw_text)

    pos = 0
    candidate_lines: List[Dict[str, int]] = []
    for line in raw_text.splitlines(keepends=True):
        line_start = pos
        line_end = pos + len(line)
        line_no_newline = line.rstrip("\r\n")

        if lower_bound <= line_start < upper_bound:
            if WORK_DATE_RANGE_PATTERN.search(line_no_newline):
                candidate_lines.append({
                    "line_start": line_start,
                    "line_end":   line_end,
                })

        pos = line_end

    if not candidate_lines:
        return None

    first = candidate_lines[0]
    return {
        "section_key":   "experience",
        "line_start":    first["line_start"],
        "line_end":      first["line_end"],
        "content_start": first["line_start"],
    }


def _rescue_jobs_from_skills_chunk(sections: Dict[str, Any]) -> Dict[str, Any]:
    """
    Detect and rescue job experience entries that were misclassified into the
    skills section due to non-standard resume layouts (e.g. a 'Skills' heading
    appears between experience entries in the original document).

    When a "Role at Company (Month YYYY" pattern is found inside the skills
    text, the chunk is split at that position:
      - Text before the first job header  → remains in 'skills'
      - Text from the first job header onward → appended to 'experience'

    Example trigger layout (Yeshwanth-style resume):
        [Experience header]
          Job 1 (WineDirect)  ← captured correctly
        [Skills header]        ← misplaced heading causes the problem
          skill bullets
          Job 2 (Albany)       ← these 3 jobs get rescued back to experience
          Job 3 (Virtusa)
          Job 4 (iNtechspace)
        [Education header]

    Note: integrity_check counters are intentionally not updated here because
    they reflect original raw-text slice boundaries and are diagnostic only.
    """
    skills_text = sections.get("skills")
    if not isinstance(skills_text, str) or not skills_text.strip():
        return sections

    match = _JOB_ROLE_IN_NON_EXPERIENCE_PATTERN.search(skills_text)
    if not match:
        return sections  # No embedded jobs detected; nothing to rescue

    split_pos = match.start()
    skills_only = skills_text[:split_pos].strip()
    rescued_jobs = skills_text[split_pos:].strip()

    if not rescued_jobs:
        return sections

    logger.warning(
        f"[RESCUE] Found {len(rescued_jobs)} chars of job experience embedded in "
        f"'skills' section at char offset {split_pos}. Rescuing to 'experience'."
    )

    # Update skills section; set to None if all content was job entries
    sections["skills"] = skills_only if skills_only else None

    # Append rescued jobs to the existing experience section (if any)
    existing_exp = (sections.get("experience") or "").strip()
    sections["experience"] = (
        existing_exp + "\n\n" + rescued_jobs if existing_exp else rescued_jobs
    )

    return sections


# ─────────────────────────────────────────────────────────────────────────────
# BACKWARD-COMPATIBILITY UTILITY (used by other modules)
# ─────────────────────────────────────────────────────────────────────────────

BULLET_PREFIX_PATTERN = re.compile(
    r"^\s*(?:--+|[-*\u2022\u2023\u25E6\u2043\u2219\u00B7]+)"
    r"(?:\s+|(?=[A-Za-z0-9]))"
)


def strip_bullet_prefix(text: str) -> str:
    """
    Remove leading bullet symbols from a line of text.

    NOTE:
      - This function is kept for backward compatibility.
      - The new chunking logic does NOT depend on it.
      - Other modules (ai_parser, resume_agents, etc.) still import it.
    """
    stripped = text
    while True:
        new_text = BULLET_PREFIX_PATTERN.sub("", stripped, count=1)
        if new_text == stripped:
            break
        stripped = new_text
    return stripped.lstrip()