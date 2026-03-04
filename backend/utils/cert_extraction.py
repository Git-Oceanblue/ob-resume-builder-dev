"""
cert_extraction.py — Format-aware, schema-enforced certification extractor.

Architecture (5-step pipeline):
  1. classify_cert_section(text)          → (CertFormat, confidence 0-100)
  2. extract_cert_groups_python(text, fmt) → List[CertGroup]   [TABLE formats only]
  3. LLM extracts non-table formats       → rich JSON dict
  4. normalize_rich_llm_output(data)      → List[CertGroup]    [LLM path]
  5. normalize_cert_groups(groups)        → List[Dict]         [flat, frontend-compatible]

Key design principles
─────────────────────
• Comma splitting is GATED by format + split_confidence:
    TABLE cell    → split_confidence = 90 (high, explicit structure)
    INLINE para   → split_confidence = 50 (low, commas may be within cert name)
    HEADING break → split_confidence = 40 (ambiguous)
  If split_confidence < SPLIT_THRESHOLD (85) → keep as one grouped entry.

• row_grouped = True  means multiple cert names share one issuer/date.
• inherited_issuer    flags when issuer was NOT explicitly stated per cert.
• raw_text_backup     is ALWAYS populated — no data loss under any path.
"""

from __future__ import annotations

import re
import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# CONSTANTS
# ─────────────────────────────────────────────────────────────────────────────

SPLIT_THRESHOLD = 85   # split_confidence must reach this to expand grouped names
_DASH_VALUE_RE  = re.compile(r'^\s*-+\s*$')

# Column header patterns reused from resume_agents (kept in sync)
_CERT_COL_PATTERNS: List = [
    re.compile(r'^certif(?:ication|icate)(?:\s+name)?$', re.IGNORECASE),
    re.compile(
        r'^(?:issued\s+by|issuer|issuing\s+org(?:anization)?|institution|provider)$',
        re.IGNORECASE,
    ),
    re.compile(r'^date\s+(?:obtained|issued|earned|awarded|received)(?:\s*\(.*\))?$', re.IGNORECASE),
    re.compile(r'^cert(?:ification)?\s*(?:number|no\.?|id|#)(?:\s*\(.*\))?$', re.IGNORECASE),
    re.compile(r'^(?:expir(?:ation|y)\s+date|valid\s+(?:until|through)|expires?)(?:\s*\(.*\))?$', re.IGNORECASE),
]
_COL_FIELDS = ['name', 'issuedBy', 'dateObtained', 'certificationNumber', 'expirationDate']


def _col_idx(line: str) -> int:
    s = line.strip()
    for i, p in enumerate(_CERT_COL_PATTERNS):
        if p.match(s):
            return i
    return -1


def _clean_value(v: Any) -> str:
    if not isinstance(v, str):
        return ""
    s = v.strip()
    return "" if (not s or _DASH_VALUE_RE.match(s)) else s


# ─────────────────────────────────────────────────────────────────────────────
# FORMAT ENUM
# ─────────────────────────────────────────────────────────────────────────────

class CertFormat(str, Enum):
    TABLE_SINGLE_ROW  = "TABLE_SINGLE_ROW"   # one pipe row, may have comma-sep names
    TABLE_MULTI_ROW   = "TABLE_MULTI_ROW"    # multiple pipe rows, one cert each
    TABLE_SEQUENTIAL  = "TABLE_SEQUENTIAL"   # DOCX XML cell-per-line table
    BULLET_LIST       = "BULLET_LIST"        # each bullet = one cert
    INLINE_PARAGRAPH  = "INLINE_PARAGRAPH"   # "Certifications: A, B, C"
    HEADING_LINE_BREAK = "HEADING_LINE_BREAK" # cert names on consecutive plain lines
    MIXED             = "MIXED"              # combination of above
    UNKNOWN           = "UNKNOWN"            # < 70% confidence


# ─────────────────────────────────────────────────────────────────────────────
# CERT GROUP — RICH INTERMEDIATE REPRESENTATION
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class CertGroup:
    """
    Rich intermediate representation of one certification (or a row-grouped set).

    - If row_grouped=True  → use certification_names (list of names sharing metadata)
    - If row_grouped=False → use certification_name  (single name)
    - split_confidence: 0-100.  < SPLIT_THRESHOLD → keep names joined in output.
    - raw_text_backup is ALWAYS set.
    """
    issuer:               str            = ""
    certification_name:   Optional[str]  = None   # single cert
    certification_names:  Optional[List[str]] = None  # grouped certs
    issue_date:           str            = ""
    expiration_date:      str            = ""
    credential_id:        str            = ""
    credential_url:       str            = ""
    inherited_issuer:     bool           = False
    row_grouped:          bool           = False
    split_confidence:     int            = 100
    raw_text_backup:      str            = ""


# ─────────────────────────────────────────────────────────────────────────────
# STEP 1 — FORMAT CLASSIFIER
# ─────────────────────────────────────────────────────────────────────────────

def classify_cert_section(text: str) -> Tuple[CertFormat, int]:
    """
    Analyse *text* and return (CertFormat, confidence_0_to_100).

    Detection order (first match wins):
      1. Pipe-table           → TABLE_SINGLE_ROW / TABLE_MULTI_ROW
      2. Sequential cell-line → TABLE_SEQUENTIAL
      3. Bullet list          → BULLET_LIST
      4. Inline paragraph     → INLINE_PARAGRAPH
      5. Heading+line-break   → HEADING_LINE_BREAK
      6. Fallback             → UNKNOWN
    """
    if not text or not text.strip():
        return CertFormat.UNKNOWN, 0

    lines       = [l.strip() for l in text.split('\n') if l.strip()]
    total_lines = max(len(lines), 1)

    # ── 1. Pipe table ──────────────────────────────────────────────────────
    pipe_lines = [l for l in lines if '|' in l and len(l.split('|')) >= 3]
    if pipe_lines:
        # Count actual data rows (not header-like rows)
        data_rows = [
            l for l in pipe_lines
            if not any(_col_idx(c.strip()) >= 0 for c in l.split('|') if c.strip())
        ]
        if len(data_rows) > 1:
            return CertFormat.TABLE_MULTI_ROW, 92
        return CertFormat.TABLE_SINGLE_ROW, 88

    # ── 2. Sequential cell-per-line table (DOCX XML path) ─────────────────
    header_col_count = sum(1 for l in lines if _col_idx(l) >= 0)
    if header_col_count >= 2:
        return CertFormat.TABLE_SEQUENTIAL, 87

    # ── 3. Bullet list ─────────────────────────────────────────────────────
    bullet_re = re.compile(r'^[•\-\*●◦▪►✓\u2022\u2023\u25E6\u2043]')
    bullet_count = sum(1 for l in lines if bullet_re.match(l))
    if bullet_count / total_lines >= 0.4:
        return CertFormat.BULLET_LIST, 90

    # ── 4. Inline paragraph ────────────────────────────────────────────────
    joined = ' '.join(lines)
    inline_match = re.search(r'certif\w*\s*:\s*\S', joined, re.IGNORECASE)
    if inline_match and joined.count(',') >= 1:
        confidence = 75 + min(joined.count(',') * 3, 15)   # more commas → more sure
        return CertFormat.INLINE_PARAGRAPH, min(confidence, 90)

    # ── 5. Heading + line-break ────────────────────────────────────────────
    non_bullet_lines = [l for l in lines if not bullet_re.match(l)]
    if len(non_bullet_lines) >= 2 and '|' not in text:
        return CertFormat.HEADING_LINE_BREAK, 70

    return CertFormat.UNKNOWN, 50


# ─────────────────────────────────────────────────────────────────────────────
# STEP 2 — PYTHON TABLE EXTRACTOR  (TABLE formats only)
# ─────────────────────────────────────────────────────────────────────────────

def _split_cert_names_in_cell(cell_value: str) -> Tuple[List[str], int]:
    """
    Split a table cell value that may contain comma-separated cert names.

    Returns (list_of_names, split_confidence).
    split_confidence = 90 for table cells (structure implies separation).
    Returns ([cell_value], 100) when no comma present.
    """
    if ',' not in cell_value:
        return [cell_value], 100

    parts = [p.strip() for p in cell_value.split(',') if p.strip()]
    if len(parts) <= 1:
        return [cell_value], 100

    # Sanity: each part should look like a cert name (≥5 chars, starts with capital)
    valid = sum(
        1 for p in parts
        if len(p) >= 5 and re.match(r'^[A-Z\d]', p)
    )
    confidence = 90 if valid == len(parts) else 75

    return parts, confidence


def extract_cert_groups_python(
    text: str,
    fmt: CertFormat,
) -> List[CertGroup]:
    """
    Deterministically extract certification groups from TABLE-format text.
    Returns [] when the format is not a recognised table type.
    """
    if fmt not in (
        CertFormat.TABLE_SINGLE_ROW,
        CertFormat.TABLE_MULTI_ROW,
        CertFormat.TABLE_SEQUENTIAL,
    ):
        return []

    if fmt == CertFormat.TABLE_SEQUENTIAL:
        return _extract_sequential_groups(text)
    return _extract_pipe_groups(text)


def _extract_pipe_groups(text: str) -> List[CertGroup]:
    """Extract CertGroups from pipe-delimited rows."""
    lines      = text.split('\n')
    pipe_lines = [l for l in lines if '|' in l and len(l.split('|')) >= 3]
    if not pipe_lines:
        return []

    col_order: List[str] = []
    groups:    List[CertGroup] = []

    for line in pipe_lines:
        cells = [_clean_value(c) for c in line.split('|')]
        cells = [c for c in cells if c != '' or True]  # keep all including empty
        cells = [_clean_value(c) for c in line.split('|')]

        non_empty = [c for c in cells if c]
        if not non_empty:
            continue

        # ── Detect header row ───────────────────────────────────────────────
        if not col_order:
            detected: List[Optional[str]] = [
                (_COL_FIELDS[_col_idx(c)] if _col_idx(c) >= 0 else None)
                for c in non_empty
            ]
            known = sum(1 for d in detected if d is not None)
            if known >= 1 and detected and detected[0] == 'name':
                col_order = [d or f'_skip_{i}' for i, d in enumerate(detected)]
                continue

        if not col_order:
            col_order = _COL_FIELDS[:len(non_empty)]

        # ── Build field map from this data row ─────────────────────────────
        row_map: Dict[str, str] = {}
        for ci, fld in enumerate(col_order):
            if not fld.startswith('_skip') and ci < len(non_empty):
                row_map[fld] = non_empty[ci]

        name_raw = row_map.get('name', '')
        if not name_raw:
            continue

        cert_names, split_conf = _split_cert_names_in_cell(name_raw)
        row_grouped = len(cert_names) > 1

        group = CertGroup(
            issuer             = row_map.get('issuedBy', ''),
            certification_name = cert_names[0] if not row_grouped else None,
            certification_names= cert_names    if row_grouped else None,
            issue_date         = row_map.get('dateObtained', ''),
            expiration_date    = row_map.get('expirationDate', ''),
            credential_id      = row_map.get('certificationNumber', ''),
            credential_url     = '',
            inherited_issuer   = False,
            row_grouped        = row_grouped,
            split_confidence   = split_conf,
            raw_text_backup    = line.strip(),
        )
        groups.append(group)

    return groups


def _extract_sequential_groups(text: str) -> List[CertGroup]:
    """Extract CertGroups from sequential cell-per-line (DOCX XML extractor) format."""
    non_empty = [l.strip() for l in text.split('\n') if l.strip()]

    # Find consecutive header block
    header_start  = -1
    col_order:  List[str] = []
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

    n_cols    = len(col_order)
    data_lines = non_empty[header_start + n_cols:]
    groups: List[CertGroup] = []

    for i in range(0, len(data_lines), n_cols):
        row = data_lines[i:i + n_cols]
        if not row:
            break

        row_map: Dict[str, str] = {}
        for ci, fld in enumerate(col_order):
            if ci < len(row):
                row_map[fld] = _clean_value(row[ci])

        name_raw = row_map.get('name', '')
        if not name_raw:
            continue

        raw_backup = ' | '.join(row[:n_cols])
        cert_names, split_conf = _split_cert_names_in_cell(name_raw)
        row_grouped = len(cert_names) > 1

        group = CertGroup(
            issuer             = row_map.get('issuedBy', ''),
            certification_name = cert_names[0] if not row_grouped else None,
            certification_names= cert_names    if row_grouped else None,
            issue_date         = row_map.get('dateObtained', ''),
            expiration_date    = row_map.get('expirationDate', ''),
            credential_id      = row_map.get('certificationNumber', ''),
            credential_url     = '',
            inherited_issuer   = False,
            row_grouped        = row_grouped,
            split_confidence   = split_conf,
            raw_text_backup    = raw_backup,
        )
        groups.append(group)

    return groups


# ─────────────────────────────────────────────────────────────────────────────
# STEP 4 — NORMALIZE LLM RICH OUTPUT → LIST[CERTGROUP]
# ─────────────────────────────────────────────────────────────────────────────

def normalize_rich_llm_output(data: Dict[str, Any]) -> List[CertGroup]:
    """
    Convert the rich JSON dict returned by the LLM into a list of CertGroup objects.

    Handles both the new rich schema and the legacy flat schema gracefully
    so that backward compatibility is preserved if the LLM ignores the schema hint.
    """
    raw_certs = data.get('certifications', [])
    if not isinstance(raw_certs, list):
        return []

    groups: List[CertGroup] = []

    for item in raw_certs:
        if not isinstance(item, dict):
            continue

        # ── Detect which schema shape the LLM used ────────────────────────
        has_rich_fields = 'row_grouped' in item or 'split_confidence' in item \
                          or 'certification_names' in item

        if has_rich_fields:
            # ── Rich schema path ──────────────────────────────────────────
            c_names_raw = item.get('certification_names')
            c_name_raw  = item.get('certification_name')

            cert_names: Optional[List[str]] = None
            cert_name:  Optional[str]       = None

            if isinstance(c_names_raw, list):
                cert_names = [_clean_value(n) for n in c_names_raw if _clean_value(n)]
            if isinstance(c_name_raw, str):
                cert_name = _clean_value(c_name_raw) or None

            split_conf  = int(item.get('split_confidence', 80))
            row_grouped = bool(item.get('row_grouped', False))

            groups.append(CertGroup(
                issuer              = _clean_value(item.get('issuer', '')),
                certification_name  = cert_name,
                certification_names = cert_names,
                issue_date          = _clean_value(item.get('issue_date', '')),
                expiration_date     = _clean_value(item.get('expiration_date', '')),
                credential_id       = _clean_value(item.get('credential_id', '')),
                credential_url      = _clean_value(item.get('credential_url', '')),
                inherited_issuer    = bool(item.get('inherited_issuer', False)),
                row_grouped         = row_grouped,
                split_confidence    = split_conf,
                raw_text_backup     = _clean_value(item.get('raw_text_backup', ''))
                                      or str(item),
            ))
        else:
            # ── Legacy flat schema path (backward compat) ─────────────────
            name = _clean_value(item.get('name', '') or item.get('certification_name', ''))
            if not name:
                continue
            groups.append(CertGroup(
                issuer              = _clean_value(item.get('issuedBy', '')),
                certification_name  = name,
                certification_names = None,
                issue_date          = _clean_value(item.get('dateObtained', '')),
                expiration_date     = _clean_value(item.get('expirationDate', '')),
                credential_id       = _clean_value(item.get('certificationNumber', '')),
                credential_url      = _clean_value(item.get('credentialUrl', '')),
                inherited_issuer    = False,
                row_grouped         = False,
                split_confidence    = 100,
                raw_text_backup     = _clean_value(item.get('rawTextBackup', '')),
            ))

    return groups


# ─────────────────────────────────────────────────────────────────────────────
# STEP 5 — NORMALIZE CERT GROUPS → FLAT FRONTEND DICTS
# ─────────────────────────────────────────────────────────────────────────────

def _flat_cert(group: CertGroup, name: str) -> Dict[str, Any]:
    """Build one flat cert dict (frontend-compatible schema) from a CertGroup."""
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
    """
    Normalize CertGroups into flat cert dicts (frontend-compatible).

    Expansion rules:
      row_grouped=True, certification_names present:
        split_confidence >= SPLIT_THRESHOLD → one flat cert per name (shared metadata)
        split_confidence <  SPLIT_THRESHOLD → one flat cert with names joined by ', '
      row_grouped=False (or no names list):
        use certification_name directly
    """
    results: List[Dict[str, Any]] = []

    for group in groups:
        if group.row_grouped and group.certification_names:
            valid_names = [n.strip() for n in group.certification_names if n and n.strip()]
            if not valid_names:
                continue

            if group.split_confidence >= SPLIT_THRESHOLD:
                # High confidence → expand to individual certs
                for name in valid_names:
                    results.append(_flat_cert(group, name))
                logger.info(
                    "[cert-norm] Expanded %d grouped certs from '%s' (split_conf=%d)",
                    len(valid_names), group.issuer or 'unknown issuer', group.split_confidence,
                )
            else:
                # Low confidence → keep joined under one entry
                joined = ', '.join(valid_names)
                results.append(_flat_cert(group, joined))
                logger.info(
                    "[cert-norm] Kept %d names JOINED (split_conf=%d < %d): '%s'",
                    len(valid_names), group.split_confidence, SPLIT_THRESHOLD, joined,
                )

        elif group.certification_name:
            results.append(_flat_cert(group, group.certification_name))

    return results


# ─────────────────────────────────────────────────────────────────────────────
# VALIDATION GATE
# ─────────────────────────────────────────────────────────────────────────────

def validate_cert_groups(groups: List[CertGroup]) -> List[CertGroup]:
    """
    Hard validation layer — applied after extraction, before normalization.

    Rules:
      1. No group without raw_text_backup  → populate from available fields.
      2. No splitting without split_confidence field (already enforced by dataclass default).
      3. split_confidence < SPLIT_THRESHOLD → force row_grouped=True.
      4. No group with empty name(s)  → drop.
      5. Deduplicate by normalised name.
    """
    seen: set = set()
    valid: List[CertGroup] = []

    for g in groups:
        # Rule 1: ensure raw_text_backup
        if not g.raw_text_backup:
            g.raw_text_backup = (
                g.certification_name
                or ', '.join(g.certification_names or [])
                or 'unknown'
            )

        # Rule 3: low split_confidence → must be row_grouped
        if g.split_confidence < SPLIT_THRESHOLD and g.certification_names:
            g.row_grouped = True

        # Rule 4: drop groups with no usable names
        has_name = bool(
            (g.certification_name and g.certification_name.strip())
            or any(n and n.strip() for n in (g.certification_names or []))
        )
        if not has_name:
            logger.warning("[cert-validate] Dropping group with no cert name: %s", g.raw_text_backup[:80])
            continue

        # Rule 5: deduplicate — key is all normalised names joined
        names_for_key = (
            [g.certification_name] if g.certification_name
            else (g.certification_names or [])
        )
        key = '|'.join(sorted(n.lower().strip() for n in names_for_key if n))
        if key in seen:
            logger.info("[cert-validate] Deduplicating cert group: %s", key[:60])
            continue
        seen.add(key)

        valid.append(g)

    return valid


# ─────────────────────────────────────────────────────────────────────────────
# TOP-LEVEL PIPELINE
# ─────────────────────────────────────────────────────────────────────────────

def run_cert_extraction_pipeline(
    text: str,
    llm_raw_data: Optional[Dict[str, Any]] = None,
) -> Tuple[List[Dict[str, Any]], str, int]:
    """
    Full certification extraction pipeline.

    Args:
        text:         Raw resume text sent to the certification agent.
        llm_raw_data: Parsed JSON dict from the LLM response (None for table-only path).

    Returns:
        (flat_certs, format_type_str, extraction_confidence)
    """
    # Step 1: classify
    fmt, fmt_confidence = classify_cert_section(text)
    logger.info("[cert-pipeline] Format: %s (confidence=%d)", fmt.value, fmt_confidence)

    groups: List[CertGroup] = []

    # Step 2: Python extraction for TABLE formats
    if fmt in (CertFormat.TABLE_SINGLE_ROW, CertFormat.TABLE_MULTI_ROW, CertFormat.TABLE_SEQUENTIAL):
        groups = extract_cert_groups_python(text, fmt)
        if groups:
            logger.info("[cert-pipeline] Python table extractor produced %d group(s)", len(groups))

    # Step 4: Normalize LLM output and merge (if provided)
    if llm_raw_data:
        llm_groups = normalize_rich_llm_output(llm_raw_data)
        if llm_groups:
            logger.info("[cert-pipeline] LLM produced %d group(s)", len(llm_groups))

        if groups:
            # Merge: LLM groups that are NOT already covered by Python groups
            py_keys = set()
            for g in groups:
                names = [g.certification_name] if g.certification_name else (g.certification_names or [])
                for n in names:
                    if n:
                        py_keys.add(n.lower().strip())

            for lg in llm_groups:
                lg_names = [lg.certification_name] if lg.certification_name else (lg.certification_names or [])
                if not any(n.lower().strip() in py_keys for n in lg_names if n):
                    groups.append(lg)
        else:
            groups = llm_groups

    if fmt_confidence < 70 and groups:
        # Low format confidence → preserve full source text as backup on all groups
        for g in groups:
            if not g.raw_text_backup or g.raw_text_backup == 'unknown':
                g.raw_text_backup = text[:500]

    # Step 3: Validate
    groups = validate_cert_groups(groups)

    # Step 5: Normalize to flat
    flat = normalize_cert_groups(groups)
    logger.info("[cert-pipeline] Final flat certs: %d", len(flat))

    return flat, fmt.value, fmt_confidence
