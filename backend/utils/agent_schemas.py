from typing import Dict, Any


class ResumeAgentSchemas:
    """
    Centralized schema definitions for resume processing agents.
    Each schema is focused on a specific resume section for optimal extraction.
    """

    @staticmethod
    def get_header_agent_schema() -> Dict[str, Any]:
        """Schema for extracting personal information and header details"""
        return {
            "name": "extract_header_info",
            "description": "Extract personal information and header details from resume",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "Full name of the person. Extract ONLY the name - no titles, emails, phone numbers."
                    },
                    "title": {
                        "type": "string",
                        "description": "Professional title of the person (e.g., 'Senior Software Engineer', 'QA Analyst')"
                    },
                    "requisitionNumber": {
                        "type": "string",
                        "description": "Requisition number if explicitly mentioned in the resume"
                    }
                },
                "required": ["name"]
            }
        }

    @staticmethod
    def get_summary_agent_schema() -> Dict[str, Any]:
        """Schema for extracting professional summary and overview sections"""
        return {
            "name": "extract_professional_summary",
            "description": "Extract professional summary, career overview, and profile sections including professional title",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {
                        "type": "string",
                        "description": "Professional title of the person"
                    },
                    "professionalSummary": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": (
                            "Array of professional summary paragraphs and bullet points EXACTLY as written. "
                            "Each paragraph or bullet point is a SEPARATE array item. "
                            "Include EVERY point without exception - do NOT truncate or summarize. "
                            "Preserve original wording faithfully."
                        )
                    },
                    "summarySections": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "title": {
                                    "type": "string",
                                    "description": "The title of the subsection - ONLY include explicitly labeled subsections"
                                },
                                "content": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                    "description": "Bullet points or paragraphs within this subsection, each as a separate item"
                                }
                            }
                        },
                        "description": "Only include explicitly labeled subsections with clear titles"
                    }
                },
                "required": ["professionalSummary"]
            }
        }

    @staticmethod
    def get_experience_agent_schema() -> Dict[str, Any]:
        return {
            "name": "extract_employment_history",
            "description": "Extract complete employment history with all job details",
            "parameters": {
                "type": "object",
                "properties": {
                    "employmentHistory": {
                        "type": "array",
                        "description": (
                            "MANDATORY: Complete employment history with ALL jobs and details preserved exactly "
                            "as written. Every single job entry MUST be included - missing even one job is "
                            "unacceptable."
                        ),
                        "items": {
                            "type": "object",
                            "properties": {

                                # ── Company / Role ────────────────────────────────────────
                                "companyName": {
                                    "type": "string",
                                    "description": (
                                        "Name of the company. If clients are mentioned, format as "
                                        "'CompanyName (Client1, Client2, Client3)' with all client names "
                                        "separated by commas."
                                    )
                                },
                                "roleName": {
                                    "type": "string",
                                    "description": ("Job title or role exactly as stated in the resume.\n"
                                                    "If a job title or role is not explicitly mentioned in the resume, do not infer, assume, or generate one. Only extract and use information that is clearly stated in the resume. If the job title is missing, leave the field empty or mark it as 'Not Provided' instead of creating a new title.")
                                },

                                # ── Dates ────────────────────────────────────────────────
                                "workPeriod": {
                                    "type": "string",
                                    "pattern": (
                                        "^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \\d{4} - "
                                        "(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \\d{4}$|"
                                        "^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \\d{4} - Till Date$"
                                    ),
                                    "description": (
                                        "MANDATORY 3-LETTER MONTH + 4-DIGIT YEAR FORMAT.\n"
                                        "NEVER use full month names like 'January', 'February', 'September', etc.\n"
                                        "ALWAYS use ONLY these 3-letter abbreviations: "
                                        "Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec.\n"
                                        "Format MUST be: 'MMM YYYY - MMM YYYY'  OR  'MMM YYYY - Till Date'\n"
                                        "Use regular hyphen (-) with single space on each side.\n"
                                        "CORRECT examples: 'Jun 2024 - Sep 2025', 'Mar 2023 - Till Date'\n"
                                        "FORBIDDEN: 'January 2024', 'February 2025', 'Sept 2024', 'Mar"
                                    )
                                },

                                # ── Location ─────────────────────────────────────────────
                                "location": {
                                    "type": "string",
                                    "pattern": "^[A-Za-z\\s]+, [A-Za-z\\s]+$",
                                    "description": (
                                        "CRITICAL LOCATION FORMAT: 'State' .\n"
                                        "USA: use 2-letter state abbreviation.  CORRECT: 'TX', 'NY'\n"
                                        "India: use ONLY 'India' – DO NOT include state codes like 'KA', 'TN', 'MH'.\n"
                                        "  CORRECT: 'India'   WRONG: 'Hyderabad, Telangana, India'\n"
                                        "Other: 'State'. CORRECT: 'OH', 'WI'\n\n"
                                        "EMBEDDED LOCATION RULE: If the job location is NOT listed separately but IS "
                                        "embedded in the company name (e.g. 'IBM India Pvt Ltd, Hyderabad, India'), "
                                        "extract the city and country from the company name.\n"
                                        "EXAMPLE: Company='IBM India Pvt Ltd, Hyderabad, India' → location='India'\n"
                                        "If no location can be found, leave this field empty."
                                    )
                                },

                                # ── Projects ─────────────────────────────────────────────
                                "projects": {
                                    "type": "array",
                                    "description": (
                                        "🚨 CRITICAL EXPLICIT-PROJECT RULE 🚨\n\n"
                                        "ONLY include projects if the resume text contains EXPLICIT project names, "
                                        "project titles, or clearly demarcated project sections.\n\n"
                                        "DO NOT invent or infer projects from general responsibilities.\n"
                                        "DO NOT convert bullet points into projects.\n"
                                        "DO NOT create projects from vague initiatives or phrases like "
                                        "'worked on multiple initiatives'.\n\n"
                                        "EXPLICIT = resume literally says 'Project X', 'Engagement Y', "
                                        "'Initiative Z' with a dedicated name.\n"
                                        "NOT EXPLICIT = resume says 'Worked on API development'.\n\n"
                                        "If NO explicitly named projects → return empty array [].\n\n"
                                        "When projects DO exist:\n"
                                        "  • Extract ALL of them – missing a project is a data-loss error.\n"
                                        "  • Number them in DESCENDING order: most recent project = highest number.\n"
                                        "    Example: 3 projects → 'Project 3: ...', 'Project 2: ...', 'Project 1: ...'"
                                    ),
                                    "items": {
                                        "type": "object",
                                        "properties": {

                                            "projectName": {
                                                "type": "string",
                                                "description": (
                                                    "MANDATORY FORMAT: 'Project N: ProjectTitle / Role'\n"
                                                    "Rules:\n"
                                                    "  • N is the descending project number (most-recent = highest)\n"
                                                    "  • Use a colon (:) after 'Project N'\n"
                                                    "  • Use ' / ' (space-slash-space) before the role\n"
                                                    "  • If role is unknown, omit the slash and role\n\n"
                                                    "CORRECT: 'Project 3: Data Pipeline Optimization / Senior DBA'\n"
                                                    "CORRECT: 'Project 1: E-Commerce Platform'\n"
                                                    "WRONG:   'Project 3:DataPipeline/DBA'  (no spaces)\n"
                                                    "WRONG:   'Data Pipeline Optimization'  (no Project prefix)\n"
                                                    "WRONG:   'Project Data Pipeline'       (no number or colon)"
                                                )
                                            },

                                            "projectLocation": {
                                                "type": "string",
                                                "description": (
                                                    "Location where this specific project was performed, ONLY if "
                                                    "explicitly mentioned and different from the job location. "
                                                    "Same format as job location: 'City, State/Country'."
                                                )
                                            },

                                            "projectResponsibilities": {
                                                "type": "array",
                                                "items": {"type": "string"},
                                                "description": (
                                                    "List of responsibilities and achievements specific to this project. "
                                                    "Extract ALL bullet points – do NOT truncate. "
                                                    "Preserve original wording; do not summarize."
                                                )
                                            },

                                            "projectDescription": {
                                                "type": "string",
                                                "description": (
                                                    "One-sentence description of what this project delivered or involved. "
                                                    "Infer from the first or most descriptive responsibility bullet if "
                                                    "no explicit description is labeled. Keep to 1-2 sentences."
                                                )
                                            },
                                            "keyTechnologies": {
                                                "type": "string",
                                                "description": (
                                                    "MANDATORY: Comma-separated list of all technologies, tools, platforms, "
                                                    "and frameworks used in THIS project.\n"
                                                    "INFERENCE RULE: If there is no explicit 'Technologies:' label, "
                                                    "EXTRACT and INFER technologies from the responsibility bullet points. "
                                                    "Scan every bullet for: tool names, platform names, language names, "
                                                    "API names, cloud platforms, frameworks, etc.\n\n"
                                                    "EXAMPLES to extract from bullets:\n"
                                                    "  'using Triggers, Apex classes, LWC, Aura components' "
                                                    "→ 'Apex Triggers, Apex Classes, LWC, Aura Components'\n"
                                                    "  'integrations using SOAP and REST API' → 'SOAP, REST API'\n"
                                                    "  'using Data Loader' → 'Data Loader'\n"
                                                    "  'deploy via Change Sets' → 'Change Sets'\n\n"
                                                    "ALWAYS populate this field – empty is not acceptable when bullets "
                                                    "exist. Do not duplicate job-level tech here if job-level is populated."
                                                )
                                            },

                                            "period": {
                                                "type": "string",
                                                "description": (
                                                    "MANDATORY 3-LETTER MONTH FORMAT for this project's duration.\n"
                                                    "Use ONLY 3-letter abbreviations: "
                                                    "Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec.\n"
                                                    "Format: 'MMM YYYY - MMM YYYY'  OR  'MMM YYYY - Till Date'\n"
                                                    "CRITICAL: This MUST be the project-specific date range – not a copy "
                                                    "of the job's workPeriod. If the project has no distinct dates, "
                                                    "leave this field EMPTY rather than duplicating the job period.\n"
                                                    "CORRECT: 'Jun 2023 - Sep 2023'\n"
                                                    "FORBIDDEN: copying job workPeriod verbatim into this field"
                                                )
                                            }
                                        }
                                    }
                                },

                                # ── Responsibilities ─────────────────────────────────────
                                "responsibilities": {
                                    "type": "array",
                                    "items": {
                                        "type": "string"
                                    },
                                    "description": (
                                        "🚨 CRITICAL RULE 🚨: If this job has ANY projects listed above, "
                                        "leave this array COMPLETELY EMPTY [].\n\n"
                                        "Only populate when NO projects are present for this job.\n\n"
                                        "When populating:\n"
                                        "  • Extract ALL responsibilities – do NOT truncate after 2-3 items.\n"
                                        "  • Maximum 8 items; each under 400 characters.\n"
                                        "  • Preserve original wording – do not summarize or merge bullets.\n\n"
                                        "RULE:  projects exist  →  responsibilities = []\n"
                                        "RULE:  no projects     →  responsibilities = [all bullets]"
                                    )
                                },

                                # ── Job-level tech ───────────────────────────────────────
                                "keyTechnologies": {
                                    "type": "string",
                                    "description": (
                                        "🚨 CRITICAL RULE 🚨: If this job has ANY projects listed above, "
                                        "leave this field COMPLETELY EMPTY (empty string '').\n\n"
                                        "Only populate when NO projects are present for this job.\n"
                                        "When projects exist, all technology info belongs in each project's "
                                        "keyTechnologies field.\n\n"
                                        "RULE:  projects exist  →  keyTechnologies = ''\n"
                                        "RULE:  no projects     →  keyTechnologies = 'list of technologies'\n\n"
                                        "VIOLATION: filling both job-level AND project-level tech causes "
                                        "duplicate data in the final resume."
                                    )
                                },

                                # ── Subsections ──────────────────────────────────────────
                                "subsections": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "title": {"type": "string"},
                                            "content": {"type": "array", "items": {"type": "string"}}
                                        }
                                    },
                                    "description": (
                                        "Only include explicitly labeled subsections within this job entry. "
                                        "Do not create artificial subsections from standalone bullet points."
                                    )
                                }
                            }
                        }
                    }
                },
                "required": ["employmentHistory"]
            }
        }

    @staticmethod
    def get_education_agent_schema() -> Dict[str, Any]:
        """Schema for extracting education and academic background"""
        return {
            "name": "extract_education_history",
            "description": (
                "Extract complete education history and academic qualifications with mandatory "
                "degree standardization and proper sorting."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "education": {
                        "type": "array",
                        "description": (
                            "CRITICAL REQUIREMENTS:\n"
                            "1) MANDATORY SORTING: Education entries MUST be sorted in ASCENDING order by "
                            "degree level (lowest degree first).\n"
                            "   Exact order: AA/AS (lowest) → BS (bachelors) → MS/MA/MBA/MCom (masters) "
                            "→ PhD/JD (highest).\n"
                            "   If multiple degrees of same level, sort by date (oldest first).\n\n"
                            "2) MANDATORY STANDARDIZATION: All bachelor's degrees "
                            "(BTech/BE/BCom/BA/Bachelor) MUST become 'BS'. "
                            "All technical master's degrees (MTech/ME/Master) MUST become 'MS'. "
                            "Keep MBA, MA, MCom, PhD, JD, AA, AS as-is. NO EXCEPTIONS."
                        ),
                        "items": {
                            "type": "object",
                            "properties": {
                                "degree": {
                                    "type": "string",
                                    "description": (
                                        "MANDATORY DEGREE STANDARDIZATION:\n"
                                        "BTech/BE/BCom/BA/Bachelor → 'BS'\n"
                                        "MTech/ME/Master of Technology/Master of Engineering → 'MS'\n"
                                        "MBA → 'MBA'   MA → 'MA'   MCom → 'MCom'\n"
                                        "PhD/Doctorate → 'PhD'   JD → 'JD'   AA → 'AA'   AS → 'AS'\n"
                                        "EXAMPLES: 'Bachelor of Technology' → 'BS', 'B.Tech' → 'BS', "
                                        "'Master of Technology' → 'MS', 'M.Tech' → 'MS'."
                                    )
                                },
                                "areaOfStudy": {
                                    "type": "string",
                                    "description": "Field of study or major"
                                },
                                "school": {
                                    "type": "string",
                                    "description": "Educational institution name ONLY – exclude location information"
                                },
                                "location": {
                                    "type": "string",
                                    "pattern": "^[A-Za-z\\s]+, [A-Za-z\\s]+$",
                                    "description": (
                                        "CRITICAL LOCATION FORMAT: 'City, State/Country' with COMMA + SINGLE SPACE.\n"
                                        "USA: 2-letter state abbreviation. CORRECT: 'Austin, TX', 'Boston, MA'\n"
                                        "India: 'City, India' – NO state codes. CORRECT: 'Mumbai, India'\n"
                                        "Extract separately even if combined with school name."
                                    )
                                },
                                "date": {
                                    "type": "string",
                                    "description": (
                                        "Date of graduation or study period. "
                                        "Use 3-letter month abbreviations and 4-digit years where applicable. "
                                        "Example: 'May 2019' or '2015 - 2019'."
                                    )
                                },
                                "wasAwarded": {
                                    "type": "boolean",
                                    "description": (
                                        "Whether the degree was awarded. Must be true unless the resume explicitly "
                                        "states the degree was NOT completed/awarded."
                                    )
                                }
                            }
                        }
                    }
                },
                "required": ["education"]
            }
        }

    @staticmethod
    def get_skills_agent_schema() -> Dict[str, Any]:
        return {
            "name": "extract_technical_skills",
            "description": (
                "Extract technical skills, competencies, and skill categories with MANDATORY "
                "hierarchical structure preservation"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "skillCategories": {
                        "type": "array",
                        "description": (
                            "MANDATORY: Extract ALL technical skills grouped into logical named categories.\n\n"

                            "=== WHAT IS A 'CATEGORY'? ===\n"
                            "A category is a BROAD GROUPING such as:\n"
                            "  'Programming Languages', 'Databases', 'Cloud Platforms', 'AI/ML Frameworks'\n"
                            "An INDIVIDUAL TOOL or SKILL (e.g., 'Python', 'AWS', 'TensorFlow', 'Pyrit') "
                            "is NOT a category — it belongs INSIDE the skills array of its category.\n\n"

                            "=== CASE 1: Resume has explicit inline categories (most common) ===\n"
                            "Format: 'Category Label: Skill1, Skill2, Skill3'\n"
                            "  - Text BEFORE the colon → categoryName\n"
                            "  - Comma-separated text AFTER the colon → skills array\n"
                            "EXAMPLE:\n"
                            "  'SalesForce CRM: Apex, VisualForce, LWC' →\n"
                            "    { categoryName: 'SalesForce CRM', skills: ['Apex', 'VisualForce', 'LWC'] }\n\n"

                            "=== CASE 2: Category followed by sub-bullets (NOT inline) ===\n"
                            "Format:\n"
                            "  Vector Databases:\n"
                            "    - Pyrit\n"
                            "    - Garak\n"
                            "    - ChromaDB\n"
                            "The category name is 'Vector Databases', and the bullets are its SKILLS.\n"
                            "CORRECT output:\n"
                            "  { categoryName: 'Vector Databases', skills: ['Pyrit', 'Garak', 'ChromaDB'] }\n"
                            "WRONG output (DO NOT DO THIS):\n"
                            "  { categoryName: 'Vector Databases', skills: [] }\n"
                            "  { categoryName: 'Pyrit', skills: [] }\n"
                            "  { categoryName: 'Garak', skills: [] }\n\n"

                            "=== CASE 3: Flat list of skills with no grouping labels ===\n"
                            "If the resume lists individual tools/skills without any category labels,\n"
                            "you MUST intelligently group them into logical categories.\n"
                            "DO NOT create one categoryName entry per individual skill.\n\n"
                            "WRONG (one skill per entry — causes broken formatting):\n"
                            "  [{ categoryName: 'Python', skills: [] },\n"
                            "   { categoryName: 'TensorFlow', skills: [] },\n"
                            "   { categoryName: 'AWS', skills: [] }]\n\n"
                            "CORRECT (logically grouped):\n"
                            "  [{ categoryName: 'Programming Languages', skills: ['Python'] },\n"
                            "   { categoryName: 'AI/ML Frameworks', skills: ['TensorFlow'] },\n"
                            "   { categoryName: 'Cloud Platforms', skills: ['AWS'] }]\n\n"

                            "=== GOLDEN RULES ===\n"
                            "1. Every entry MUST have a non-empty skills array — NEVER leave skills: []\n"
                            "   If a label has sub-bullets, those bullets ARE the skills array.\n"
                            "   If a label has no sub-items and is a broad grouping, infer skills from context.\n"
                            "   If a label IS itself an individual skill/tool, merge it into a parent category.\n"
                            "2. EXTRACT EVERY SKILL — missing even one skill is a data-loss error.\n"
                            "3. PRESERVE original category names exactly when explicitly given.\n"
                            "4. Split comma-separated skill lists into individual array items.\n"
                            "5. Minimum category count = number of distinct top-level groupings in the resume.\n"
                            "   Typical: 3–15 categories. If you are producing 20+ entries, you are likely "
                            "treating individual skills as categories — STOP and regroup."
                        ),
                        "items": {
                            "type": "object",
                            "properties": {
                                "categoryName": {
                                    "type": "string",
                                    "description": (
                                        "A BROAD grouping label (e.g., 'Programming Languages', "
                                        "'Databases', 'Cloud Platforms'). "
                                        "NEVER an individual tool or technology name."
                                    )
                                },
                                "skills": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                    "description": (
                                        "MANDATORY non-empty list of individual skills/tools in this category. "
                                        "Each element is a single skill name. "
                                        "This array must NEVER be empty."
                                    )
                                },
                                "subCategories": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "name": {"type": "string"},
                                            "skills": {"type": "array", "items": {"type": "string"}}
                                        }
                                    },
                                    "description": (
                                        "Only populate when the resume explicitly has a two-level hierarchy "
                                        "(a category with named sub-groups). Leave empty otherwise."
                                    )
                                }
                            },
                            "required": ["categoryName", "skills"]
                        }
                    }
                },
                "required": ["skillCategories"]
            }
        }

    @staticmethod
    def get_certifications_agent_schema() -> Dict[str, Any]:
        """
        Schema for extracting certifications and professional licenses.

        BUG FIX #14: Each certification field is explicitly described to prevent
        the LLM from combining all content into the 'name' field.
        """
        return {
            "name": "extract_certifications",
            "description": "Extract certifications, Certified, licenses, and professional credentials",
            "parameters": {
                "type": "object",
                "properties": {
                    "certifications": {
                        "type": "array",
                        "description": (
                            "Extract EACH certification as a SEPARATE object.\n\n"
                            "TABLE FORMAT HANDLING (CRITICAL):\n"
                            "The certifications section may come from a table. The extracted text "
                            "will contain TABLE COLUMN HEADERS as plain lines:\n"
                            "  'Certification', 'Issued By', 'Date Obtained (MM/YY)', "
                            "'Certification Number (If Applicable)', 'Expiration Date (If Applicable)'\n"
                            "These are COLUMN HEADERS – DO NOT treat them as certification names.\n"
                            "Skip any line that exactly matches one of these header labels.\n\n"
                            "DASH/HYPHEN VALUES:\n"
                            "A '-' or '--' in the text means the field is NOT PROVIDED/EMPTY.\n"
                            "Do NOT extract '-' as a certification name, issuer, date, or number.\n\n"
                            "IDENTIFICATION RULE:\n"
                            "A real certification name is a phrase like 'AWS Certified Solutions Architect', "
                            "'Salesforce Certified Platform Developer I', 'PMP', 'CISSP', etc.\n"
                            "It appears AFTER all the column header lines.\n\n"
                            "DO NOT combine multiple certifications into one entry.\n"
                            "DO NOT put issuer, date, or number into the name field.\n"
                            "Only extract EXPLICITLY mentioned certifications."
                        ),
                        "items": {
                            "type": "object",
                            "properties": {

                                "name": {
                                    "type": "string",
                                    "description": (
                                        "CERTIFICATION NAME ONLY – the title of the certification, nothing else.\n\n"
                                        "CORRECT: 'AWS Certified Solutions Architect'\n"
                                        "CORRECT: 'Salesforce Certified Platform Developer I'\n"
                                        "WRONG:   'AWS Certified Solutions Architect Issued by Amazon Jun 2023'\n"
                                        "  (that incorrectly adds issuer and date into the name field)\n\n"
                                        "DO NOT include: issuer name, issue date, cert number, expiry date."
                                    )
                                },

                                "issuedBy": {
                                    "type": "string",
                                    "description": (
                                        "The organization or body that issued the certification.\n"
                                        "Extract from phrases like 'Issued by:', 'From:', 'by:', "
                                        "or parenthetical attribution.\n"
                                        "EXAMPLE: 'AWS Certified (Amazon Web Services)' → 'Amazon Web Services'\n"
                                        "If not mentioned, leave EMPTY."
                                    )
                                },

                                "dateObtained": {
                                    "type": "string",
                                    "description": (
                                        "Date when the certification was obtained.\n"
                                        "Preferred format: 'MMM YYYY' (3-letter month + 4-digit year).\n"
                                        "CORRECT: 'Jun 2023'\n"
                                        "Extract from labels: 'Obtained:', 'Date:', 'Issued:', etc.\n"
                                        "If not mentioned, leave EMPTY."
                                    )
                                },

                                "certificationNumber": {
                                    "type": "string",
                                    "description": (
                                        "Certification ID or credential number.\n"
                                        "EXAMPLES: 'SAA-C03', 'PMP#123456', 'License: XYZ789'\n"
                                        "Extract from labels: 'Certification Number:', 'ID:', 'License:', etc.\n"
                                        "If not mentioned, leave EMPTY."
                                    )
                                },

                                "expirationDate": {
                                    "type": "string",
                                    "description": (
                                        "Expiration date of the certification, if applicable.\n"
                                        "Preferred format: 'MMM YYYY' (3-letter month + 4-digit year).\n"
                                        "CORRECT: 'Jun 2026'\n"
                                        "Extract from labels: 'Expires:', 'Expiration:', 'Valid until:', etc.\n"
                                        "If no expiration or not mentioned, leave EMPTY."
                                    )
                                },

                                "credentialUrl": {
                                    "type": "string",
                                    "description": (
                                        "URL to the credential verification page, if explicitly stated.\n"
                                        "EXAMPLE: 'https://www.credly.com/badges/abc123'\n"
                                        "Only populate when a URL is EXPLICITLY provided in the text.\n"
                                        "If not mentioned, leave EMPTY."
                                    )
                                }
                            }
                        }
                    }
                },
                "required": ["certifications"]
            }
        }