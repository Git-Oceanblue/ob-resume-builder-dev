"""
Pydantic validation models for resume extraction output.

Used for:
  - Post-processing schema enforcement
  - Confidence scoring per entry
  - Structured validation before JSON is returned to the frontend

Compatible with Pydantic v2 (FastAPI >= 0.104).
"""
from __future__ import annotations

import re
import logging
from typing import Any, Dict, List

from pydantic import BaseModel, Field, model_validator

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# SHARED PATTERNS
# ─────────────────────────────────────────────────────────────────────────────

_VALID_PERIOD_RE = re.compile(
    r"^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}"
    r"\s+-\s+"
    r"((Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}|Till Date)$",
    re.IGNORECASE,
)

_VALID_MONTH_YEAR_RE = re.compile(
    r"^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}$",
    re.IGNORECASE,
)


# ─────────────────────────────────────────────────────────────────────────────
# EMPLOYMENT MODELS
# ─────────────────────────────────────────────────────────────────────────────

class ProjectOut(BaseModel):
    projectName: str = ""
    projectLocation: str = ""
    projectResponsibilities: List[str] = Field(default_factory=list)
    projectDescription: str = ""
    keyTechnologies: str = ""
    period: str = ""
    rawTextBackup: str = ""

    @model_validator(mode="after")
    def check_project(self) -> "ProjectOut":
        if not self.projectName:
            logger.warning("[validation] Project entry has empty projectName")
        if self.period and not _VALID_PERIOD_RE.match(self.period):
            logger.warning(
                "[validation] Non-standard project period '%s'", self.period
            )
        return self


class EmploymentEntryOut(BaseModel):
    companyName: str = ""
    roleName: str = ""
    workPeriod: str = ""
    location: str = ""
    projects: List[ProjectOut] = Field(default_factory=list)
    responsibilities: List[str] = Field(default_factory=list)
    keyTechnologies: str = ""
    subsections: List[Dict[str, Any]] = Field(default_factory=list)
    rawTextBackup: str = ""

    @model_validator(mode="after")
    def check_entry(self) -> "EmploymentEntryOut":
        if not self.companyName:
            logger.warning("[validation] Employment entry has no companyName")
        if not self.roleName:
            logger.warning(
                "[validation] Employment entry '%s' has no roleName",
                self.companyName,
            )
        if self.workPeriod and not _VALID_PERIOD_RE.match(self.workPeriod):
            logger.warning(
                "[validation] Non-standard workPeriod '%s' for '%s'",
                self.workPeriod, self.companyName,
            )
        has_content = bool(self.responsibilities) or bool(self.projects)
        if not has_content:
            logger.warning(
                "[validation] Entry '%s – %s' has no responsibilities or projects",
                self.companyName, self.roleName,
            )
        return self


class EmploymentHistoryOut(BaseModel):
    employmentHistory: List[EmploymentEntryOut] = Field(default_factory=list)


# ─────────────────────────────────────────────────────────────────────────────
# CERTIFICATION MODELS
# ─────────────────────────────────────────────────────────────────────────────

class CertificationOut(BaseModel):
    name: str = ""
    issuedBy: str = ""
    dateObtained: str = ""
    certificationNumber: str = ""
    expirationDate: str = ""
    credentialUrl: str = ""
    rawTextBackup: str = ""

    @model_validator(mode="after")
    def check_cert(self) -> "CertificationOut":
        if not self.name:
            logger.warning("[validation] Certification entry has empty name")
        if self.dateObtained and not _VALID_MONTH_YEAR_RE.match(self.dateObtained):
            logger.warning(
                "[validation] Non-standard dateObtained '%s' for cert '%s'",
                self.dateObtained, self.name,
            )
        if self.expirationDate and not _VALID_MONTH_YEAR_RE.match(self.expirationDate):
            logger.warning(
                "[validation] Non-standard expirationDate '%s' for cert '%s'",
                self.expirationDate, self.name,
            )
        return self


class CertificationsOut(BaseModel):
    certifications: List[CertificationOut] = Field(default_factory=list)


# ─────────────────────────────────────────────────────────────────────────────
# CONFIDENCE SCORING
# ─────────────────────────────────────────────────────────────────────────────

def score_employment_entry(job: Dict[str, Any]) -> float:
    """
    Return a confidence score (0.0–1.0) for an extracted employment entry.

    Scoring breakdown:
      companyName  present → +0.25
      roleName     present → +0.20
      workPeriod   valid   → +0.20  (partial credit if present but non-standard)
      content      present → +0.25  (responsibilities OR projects)
      location     present → +0.10

    A score < 0.80 triggers rawTextBackup population in the caller.
    """
    score = 0.0

    if job.get('companyName', '').strip():
        score += 0.25

    if job.get('roleName', '').strip():
        score += 0.20

    work_period = job.get('workPeriod', '').strip()
    if work_period:
        if _VALID_PERIOD_RE.match(work_period):
            score += 0.20
        else:
            score += 0.10  # partial: present but non-standard format

    has_responsibilities = (
        isinstance(job.get('responsibilities'), list)
        and len(job['responsibilities']) > 0
    )
    has_projects = (
        isinstance(job.get('projects'), list)
        and len(job['projects']) > 0
    )
    if has_responsibilities or has_projects:
        score += 0.25

    if job.get('location', '').strip():
        score += 0.10

    return round(min(score, 1.0), 2)


def score_certification_entry(cert: Dict[str, Any]) -> float:
    """
    Return a confidence score (0.0–1.0) for an extracted certification entry.

    Scoring breakdown:
      name      present → +0.50
      issuedBy  present → +0.20
      date      present → +0.20
      cert num  present → +0.10
    """
    score = 0.0

    if cert.get('name', '').strip():
        score += 0.50

    if cert.get('issuedBy', '').strip():
        score += 0.20

    if cert.get('dateObtained', '').strip():
        score += 0.20

    if cert.get('certificationNumber', '').strip():
        score += 0.10

    return round(min(score, 1.0), 2)
