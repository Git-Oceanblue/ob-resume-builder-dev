import React, { useState } from 'react';
import { FiDownload, FiPrinter } from 'react-icons/fi';
import { Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun, BorderStyle, AlignmentType, WidthType, ShadingType, VerticalAlign, LevelFormat, TabStopType, Break } from 'docx';
import { saveAs } from 'file-saver';

// PricingDisplay component to show token usage and cost
const PricingDisplay = ({ resumeData }) => {

  const tokenStats = resumeData?.tokenStats;

  if (!tokenStats) return null;

  return (
    <div className="mb-6 p-6 bg-gradient-to-r from-blue-50 to-indigo-50 border border-ocean-blue rounded-xl shadow-md">
      <h3 className="text-lg font-semibold text-ocean-dark mb-4 flex items-center">
        <svg className="w-5 h-5 mr-2 text-ocean-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        Resume Processing Analytics
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg p-3 shadow-sm">
          <div className="text-sm text-gray-600">Input Tokens</div>
          <div className="text-lg font-semibold text-ocean-dark">{tokenStats.promptTokens?.toLocaleString() || 0}</div>
        </div>
        <div className="bg-white rounded-lg p-3 shadow-sm">
          <div className="text-sm text-gray-600">Output Tokens</div>
          <div className="text-lg font-semibold text-ocean-dark">{tokenStats.completionTokens?.toLocaleString() || 0}</div>
        </div>
        <div className="bg-white rounded-lg p-3 shadow-sm">
          <div className="text-sm text-gray-600">Total Tokens</div>
          <div className="text-lg font-semibold text-ocean-dark">{tokenStats.totalTokens?.toLocaleString() || 0}</div>
        </div>
        <div className="bg-white rounded-lg p-3 shadow-sm">
          <div className="text-sm text-gray-600">Processing Cost</div>
          <div className="text-lg font-semibold text-green-600">${typeof tokenStats.cost === 'number' ? tokenStats.cost.toFixed(6) : '0.000000'}</div>
        </div>
      </div>
      <div className="mt-3 text-xs text-gray-600 bg-white rounded-lg p-2">
        💡 Based on OpenAI pricing: GPT-4o-mini ($0.15/1M input, $0.60/1M output) or GPT-4o ($3.00/1M input, $10.00/1M output)
      </div>
    </div>
  );
};

const GeneratedResume = ({ resumeData, previewMode = false }) => {
  const [isGenerating, setIsGenerating] = useState(false);

  // Function to handle resume download is removed in favor of Word document generation

  // Function to handle resume printing
  const handlePrint = () => {
    window.print();
  };

  const normalizeDegree = (degree = '') =>
    degree.toUpperCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();

  const degreeRank = (degree = '') => {
    const normalized = normalizeDegree(degree);
    const compact = normalized.replace(/\s+/g, '');

    if (/\b(AA|AS|ASSOCIATE)\b/.test(normalized)) return 1;
    if (/\b(BA|BS|BSC|BACHELOR|BE)\b/.test(normalized) || /BTECH/.test(compact)) return 2;
    if (/\b(MA|MS|MBA|MASTER)\b/.test(normalized) || /MTECH/.test(compact)) return 3;
    if (/\b(PHD|DOCTOR|DOCTORATE|DOCTORAL|DOCTOROL)\b/.test(normalized) || /PHD/.test(compact)) return 4;

    return 5;
  };

  const sortEducation = (education = []) =>
    education
      .map((edu, index) => ({ edu, index, rank: degreeRank(edu.degree) }))
      .sort((a, b) => a.rank - b.rank || a.index - b.index)
      .map(({ edu }) => edu);

  const sortedEducation = sortEducation(resumeData.education || []);

  const escapeRegExp = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Strip any leading bullet character (•, -, *, ●, ◦, etc.) from parsed text
  // so that we never end up with double bullets when we add our own bullet marker.
  const stripBullet = (text = '') =>
    text.replace(/^[\u2022\u25CF\u25E6\u2023\u2043\u2219\u00B7\u25CB\u25AA\u25B8\-\u2013\u2014*]\s*/, '').trim();

  // ─────────────────────────────────────────────────────────────
  // LOCATION LOOKUP TABLES  (module-level equivalent inside component)
  //   Indian state/UT names — to detect India when "India" word is absent
  //   US state 2-letter abbreviation set
  //   US full state name → 2-letter abbreviation map
  // ─────────────────────────────────────────────────────────────
  const INDIA_STATES = new Set([
    'andhra pradesh','arunachal pradesh','assam','bihar','chhattisgarh',
    'goa','gujarat','haryana','himachal pradesh','jharkhand','karnataka',
    'kerala','madhya pradesh','maharashtra','manipur','meghalaya',
    'mizoram','nagaland','odisha','orissa','punjab','rajasthan',
    'sikkim','tamil nadu','telangana','tripura','uttar pradesh',
    'uttarakhand','uttaranchal','west bengal',
    'delhi','ncr','chandigarh','puducherry','pondicherry',
    'jammu and kashmir','ladakh','lakshadweep',
  ]);

  const US_STATE_ABBREVS = new Set([
    'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
    'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
    'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
    'VA','WA','WV','WI','WY','DC',
  ]);

  const US_STATE_NAME_MAP = {
    'Alabama':'AL','Alaska':'AK','Arizona':'AZ','Arkansas':'AR','California':'CA',
    'Colorado':'CO','Connecticut':'CT','Delaware':'DE','Florida':'FL','Georgia':'GA',
    'Hawaii':'HI','Idaho':'ID','Illinois':'IL','Indiana':'IN','Iowa':'IA',
    'Kansas':'KS','Kentucky':'KY','Louisiana':'LA','Maine':'ME','Maryland':'MD',
    'Massachusetts':'MA','Michigan':'MI','Minnesota':'MN','Mississippi':'MS',
    'Missouri':'MO','Montana':'MT','Nebraska':'NE','Nevada':'NV',
    'New Hampshire':'NH','New Jersey':'NJ','New Mexico':'NM','New York':'NY',
    'North Carolina':'NC','North Dakota':'ND','Ohio':'OH','Oklahoma':'OK',
    'Oregon':'OR','Pennsylvania':'PA','Rhode Island':'RI','South Carolina':'SC',
    'South Dakota':'SD','Tennessee':'TN','Texas':'TX','Utah':'UT','Vermont':'VT',
    'Virginia':'VA','Washington':'WA','West Virginia':'WV','Wisconsin':'WI',
    'Wyoming':'WY','District of Columbia':'DC',
  };

  /**
   * resolveUSStateAbbrev
   * Given a single location segment string, returns the 2-letter US state
   * abbreviation if the segment matches either an abbreviation or a full
   * state name. Returns null otherwise.
   */
  const resolveUSStateAbbrev = (segment = '') => {
    const trimmed = segment.trim();
    // Already a 2-letter abbreviation?
    const upper = trimmed.toUpperCase();
    if (US_STATE_ABBREVS.has(upper)) return upper;
    // Full state name (case-insensitive)?
    const lc = trimmed.toLowerCase();
    const found = Object.entries(US_STATE_NAME_MAP).find(
      ([name]) => name.toLowerCase() === lc
    );
    return found ? found[1] : null;
  };

  // ─────────────────────────────────────────────────────────────
  // CENTRALIZED HELPER: formatEmploymentLocation
  //   India  → "India"                 (country only)
  //   USA    → state abbreviation      (e.g. "OH")
  //   Other  → original string
  //   Handles: "City, ST", "City, FullState", "City, FullState, ZIP",
  //            "City, FullState, USA", "City, India"
  //   Used in BOTH DOCX generation AND the on-screen preview
  // ─────────────────────────────────────────────────────────────
  const formatEmploymentLocation = (locationString = '') => {
    const raw = typeof locationString === 'string' ? locationString : '';
    const normalized = raw.replace(/\s+/g, ' ').trim();
    if (!normalized) return '';

    const parts = normalized.split(',').map(p => p.trim()).filter(Boolean);

    // India → "India" only
    // Detect by the word "India" OR by any Indian state / UT name
    const isIndia = parts.some(p => /\bindia\b/i.test(p)) ||
                    parts.some(p => INDIA_STATES.has(p.toLowerCase()));
    if (isIndia) return 'India';

    // US → state abbreviation only
    // Scan all segments for a recognisable state (abbrev or full name).
    // Skip pure-numeric ZIP segments.
    for (const part of parts) {
      if (/^\d+$/.test(part)) continue; // skip ZIP codes
      const abbrev = resolveUSStateAbbrev(part);
      if (abbrev) return abbrev;
    }

    // Explicit USA/US country label but no state found
    if (parts.some(p => /\b(united states of america|united states|usa|u\.s\.a\.|u\.s\.)\b/i.test(p))) {
      return 'United States';
    }

    // For other countries, return as-is
    return normalized;
  };

  // ─────────────────────────────────────────────────────────────
  // HELPER: getEducationCountry
  //   Extracts the abbreviated location for the education table.
  //   India  → "India"
  //   USA    → state abbreviation only  (e.g. "IL" for "Chicago, IL")
  //   Other  → last comma-segment (country)
  // ─────────────────────────────────────────────────────────────
  const getEducationCountry = (location = '') => {
    const raw = typeof location === 'string' ? location : '';
    const normalized = raw.replace(/\s+/g, ' ').trim();
    if (!normalized) return '';

    const parts = normalized.split(',').map(p => p.trim()).filter(Boolean);

    // India → "India"
    if (parts.some(p => /\bindia\b/i.test(p))) return 'India';

    // US → state abbreviation only
    for (const part of parts) {
      if (/^\d+$/.test(part)) continue;
      const abbrev = resolveUSStateAbbrev(part);
      if (abbrev) return abbrev;
    }

    // Explicit USA/US label but no state found
    if (parts.some(p => /\b(united states of america|united states|usa|u\.s\.a?\.)\b/i.test(p))) {
      return 'United States';
    }

    // Generic: return the last segment as country
    return parts[parts.length - 1] || normalized;
  };

  // Pre-compile month pattern regex for performance
  const MONTH_PATTERN = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
  
  // ─────────────────────────────────────────────────────────────
  // CENTRALIZED HELPER: formatProjectTitle
  //   - Cleans "Project N:" prefixes, embedded dates, and location text
  //   - Adds "Project N:" prefix only when a job has MULTIPLE projects
  //   - Used in BOTH DOCX generation AND the on-screen preview
  // ─────────────────────────────────────────────────────────────
  const formatProjectTitle = (project = {}, index = 0, totalProjects = 0) => {
    // Support alternative project name fields that may come from different API shapes
    const rawName = typeof project.projectName === 'string' && project.projectName
      ? project.projectName
      : (typeof project.title === 'string' && project.title
          ? project.title
          : (typeof project.name === 'string' && project.name
              ? project.name
              : (typeof project.projectTitle === 'string' ? project.projectTitle : '')));
    const rawLocation = typeof project.projectLocation === 'string' ? project.projectLocation : '';
    let cleanName = rawName.replace(/\s+/g, ' ').trim();

    // Remove labels such as "Project 1:", "Project 2 -", "PROJECT 3 -".
    cleanName = cleanName.replace(/^\s*project\s*\d*\s*[:\-–—]\s*/i, '');
    cleanName = cleanName.replace(/^\s*project\s*\d+\s+/i, '');

    // Remove embedded date ranges from project names.
    const dateLikePatterns = [
      new RegExp(`\\(?\\b${MONTH_PATTERN}\\.?\\s+\\d{4}\\s*[-–—]\\s*(?:${MONTH_PATTERN}\\.?\\s+\\d{4}|present|current|till\\s*date)\\b\\)?`, 'gi'),
      /\(?\b\d{4}\s*[-–—]\s*(?:\d{4}|present|current)\b\)?/gi,
      /\(?\b(?:0?[1-9]|1[0-2])\s*[/-]\s*\d{2,4}\s*[-–—]\s*(?:0?[1-9]|1[0-2])\s*[/-]\s*\d{2,4}\b\)?/gi
    ];
    dateLikePatterns.forEach((pattern) => {
      cleanName = cleanName.replace(pattern, ' ');
    });

    // Remove location from name when same location is available separately.
    const location = rawLocation.replace(/\s+/g, ' ').trim();
    if (location) {
      const escapedLocation = escapeRegExp(location);
      const locationWithFlexibleCommas = location
        .split(',')
        .map(part => part.trim())
        .filter(Boolean)
        .map(part => escapeRegExp(part))
        .join('\\s*,\\s*');

      cleanName = cleanName.replace(new RegExp(`\\s*[-–—,:|]?\\s*${escapedLocation}\\s*`, 'ig'), ' ');
      if (locationWithFlexibleCommas) {
        cleanName = cleanName.replace(new RegExp(`\\s*[-–—,:|]?\\s*${locationWithFlexibleCommas}\\s*`, 'ig'), ' ');
      }
    }

    // Final cleanup to avoid punctuation artifacts after removals.
    cleanName = cleanName
      .replace(/[([]\s*[)\]]/g, ' ')
      .replace(/\s*[-–—,:|]\s*[-–—,:|]\s*/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .replace(/^[-–—,:|()\s]+|[-–—,:|()\s]+$/g, '')
      .trim();

    // If cleaning stripped everything, fall back to a reasonable portion of the original
    // (first ~60 chars) so project names are never silently lost.
    const baseName = cleanName
      || (rawName.trim().length > 0 ? rawName.trim().slice(0, 60) : 'Project');

    // Add "Project N:" prefix ONLY if there are multiple projects
    if (totalProjects > 1) {
      return `Project ${index + 1}: ${baseName}`;
    }
    return baseName;
  };

  // Helper function to create education table
  const createEducationTable = (resumeData) => {
    // Header cell helper: Arial 10pt bold, D9D9D9 shading, centered, NoSpacing
    const eduHdrCell = (width, boldRuns) => new TableCell({
      width: { size: width, type: WidthType.DXA },
      shading: { fill: 'D9D9D9', type: ShadingType.CLEAR },
      verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 0, line: 240, lineRule: 'auto' },
        children: boldRuns,
      })],
    });

    // Data cell helper: Calibri 11pt normal, centered, NoSpacing, minimal height
    const eduDataCell = (text) => new TableCell({
      verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 0, line: 240, lineRule: 'auto' },
        children: [new TextRun({ text: text || '-', font: 'Calibri', size: 22 })],
      })],
    });

    const rows = [
      // Header row
      new TableRow({
        tableHeader: true,
        alignment: AlignmentType.CENTER,
        children: [
          eduHdrCell(1653, [
            new TextRun({ text: 'Degree ', bold: true, font: 'Arial', size: 20, break: 1 }),
            new TextRun({ text: '(AA/AS, BA/BS, BS/BTech/BE, MS/MTech/MBA/MA, PhD/Doctoral)', font: 'Arial', size: 20 }),
          ]),
          eduHdrCell(1901, [
            new TextRun({ text: 'Area of Study', bold: true, font: 'Arial', size: 20 }),
          ]),
          eduHdrCell(2684, [
            new TextRun({ text: 'School/College/University', bold: true, font: 'Arial', size: 20 }),
          ]),
          eduHdrCell(1712, [
            new TextRun({ text: 'Location', bold: true, font: 'Arial', size: 20 }),
          ]),
          eduHdrCell(1524, [
            new TextRun({ text: 'Was the degree awarded?', bold: true, font: 'Arial', size: 20 }),
            new TextRun({ text: ' (Yes/No)', font: 'Arial', size: 20 }),
          ]),
          eduHdrCell(1316, [
            new TextRun({ text: 'OPTIONAL: Date', bold: true, font: 'Arial', size: 20 }),
            new TextRun({ text: ' (MM/YY)', font: 'Arial', size: 20 }),
          ]),
        ],
      }),
    ];

    const sortedEducation = sortEducation(resumeData.education || []);

    // Add data rows
    if (sortedEducation.length > 0) {
      sortedEducation.forEach(edu => {
        rows.push(
          new TableRow({
            height: { value: 58, rule: 'atLeast' },
            cantSplit: true,
            alignment: AlignmentType.CENTER,
            children: [
              eduDataCell(edu.degree),
              eduDataCell(edu.areaOfStudy),
              eduDataCell(edu.school),
              eduDataCell(getEducationCountry(edu.location)),
              eduDataCell(edu.wasAwarded ? 'Yes' : 'No'),
              eduDataCell(edu.date),
            ],
          })
        );
      });
    } else {
      rows.push(
        new TableRow({
          height: { value: 58, rule: 'atLeast' },
          cantSplit: true,
          alignment: AlignmentType.CENTER,
          children: ['-', '-', '-', '-', '-', '-'].map(() => eduDataCell('-')),
        })
      );
    }

    return new Table({
      alignment: AlignmentType.CENTER,
      columnWidths: [1653, 1901, 2684, 1712, 1524, 1316],
      rows,
      width: { size: 0, type: WidthType.AUTO },
      borders: {
        top:              { style: BorderStyle.SINGLE, size: 4, space: 0, color: 'auto' },
        bottom:           { style: BorderStyle.SINGLE, size: 4, space: 0, color: 'auto' },
        left:             { style: BorderStyle.SINGLE, size: 4, space: 0, color: 'auto' },
        right:            { style: BorderStyle.SINGLE, size: 4, space: 0, color: 'auto' },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 4, space: 0, color: 'auto' },
        insideVertical:   { style: BorderStyle.SINGLE, size: 4, space: 0, color: 'auto' },
      },
    });
  };

  // Helper function to create certifications table
  const createCertificationsTable = (resumeData) => {
    // Header cell helper: Arial 10pt bold, D9D9D9 shading, centered, NoSpacing
    const certHdrCell = (width, boldRuns) => new TableCell({
      width: { size: width, type: WidthType.DXA },
      shading: { fill: 'D9D9D9', type: ShadingType.CLEAR },
      verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 0, line: 240, lineRule: 'auto' },
        children: boldRuns,
      })],
    });

    // Data cell helper: Calibri 11pt normal, centered, NoSpacing, minimal height
    const certDataCell = (text) => new TableCell({
      verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 0, line: 240, lineRule: 'auto' },
        children: [new TextRun({ text: text || '-', font: 'Calibri', size: 22 })],
      })],
    });

    const rows = [
      // Header row
      new TableRow({
        tableHeader: true,
        alignment: AlignmentType.CENTER,
        children: [
          certHdrCell(3417, [
            new TextRun({ text: 'Certification', bold: true, font: 'Arial', size: 20 }),
          ]),
          certHdrCell(2424, [
            new TextRun({ text: 'Issued By', bold: true, font: 'Arial', size: 20 }),
          ]),
          certHdrCell(1834, [
            new TextRun({ text: 'Date Obtained', bold: true, font: 'Arial', size: 20 }),
            new TextRun({ text: ' (MM/YY)', font: 'Arial', size: 20 }),
          ]),
          certHdrCell(1644, [
            new TextRun({ text: 'Certification Number', bold: true, font: 'Arial', size: 20 }),
            new TextRun({ text: ' (If Applicable)', font: 'Arial', size: 20 }),
          ]),
          certHdrCell(1471, [
            new TextRun({ text: 'Expiration Date', bold: true, font: 'Arial', size: 20 }),
            new TextRun({ text: ' (If Applicable)', font: 'Arial', size: 20 }),
          ]),
        ],
      }),
    ];

    // Add data rows
    if (resumeData.certifications && resumeData.certifications.length > 0) {
      resumeData.certifications.forEach(cert => {
        rows.push(
          new TableRow({
            height: { value: 58, rule: 'atLeast' },
            cantSplit: true,
            alignment: AlignmentType.CENTER,
            children: [
              certDataCell(cert.name),
              certDataCell(cert.issuedBy),
              certDataCell(cert.dateObtained),
              certDataCell(cert.certificationNumber),
              certDataCell(cert.expirationDate),
            ],
          })
        );
      });
    } else {
      rows.push(
        new TableRow({
          height: { value: 58, rule: 'atLeast' },
          cantSplit: true,
          alignment: AlignmentType.CENTER,
          children: ['-', '-', '-', '-', '-'].map(() => certDataCell('-')),
        })
      );
    }

    return new Table({
      alignment: AlignmentType.CENTER,
      columnWidths: [3417, 2424, 1834, 1644, 1471],
      rows,
      width: { size: 0, type: WidthType.AUTO },
      borders: {
        top:              { style: BorderStyle.SINGLE, size: 4, space: 0, color: 'auto' },
        bottom:           { style: BorderStyle.SINGLE, size: 4, space: 0, color: 'auto' },
        left:             { style: BorderStyle.SINGLE, size: 4, space: 0, color: 'auto' },
        right:            { style: BorderStyle.SINGLE, size: 4, space: 0, color: 'auto' },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 4, space: 0, color: 'auto' },
        insideVertical:   { style: BorderStyle.SINGLE, size: 4, space: 0, color: 'auto' },
      },
    });
  };

  // Helper function to create employment history content
  const createEmploymentHistory = (resumeData) => {
    const paragraphs = [];

    // Shared run properties for employer/title lines
    const hdrRun = (text) => new TextRun({
      text,
      bold: true,
      boldComplexScript: true,
      size: 28,
      color: '1F497D',
      font: 'Times New Roman',
    });

    // Shared paragraph spacing for body lines
    const bodySpacing = { after: 0, line: 240, lineRule: 'auto' };

    // Bullet paragraph factory (references numbering defined in Document)
    const bulletPara = (text) => new Paragraph({
      numbering: { reference: 'resumeBullet', level: 0 },
      alignment: AlignmentType.JUSTIFIED,
      spacing: bodySpacing,
      children: [
        new TextRun({ text: stripBullet(text), font: 'Calibri', boldComplexScript: true }),
      ],
    });

    // Right-aligned tab stop at content-area right edge (letter width 12240 minus 720+720 margins)
    const RIGHT_TAB = { type: TabStopType.RIGHT, position: 10800 };

    // Single-paragraph helper: left text + right-tab + right text, both bold TNR 14pt #1F497D
    const hdrTabPara = (leftText, rightText) => new Paragraph({
      tabStops: [RIGHT_TAB],
      alignment: AlignmentType.JUSTIFIED,
      spacing: bodySpacing,
      children: [
        new TextRun({ text: leftText, bold: true, boldComplexScript: true, size: 28, color: '1F497D', font: 'Times New Roman' }),
        new TextRun({ text: '\t' }),
        new TextRun({ text: rightText, bold: true, boldComplexScript: true, size: 28, color: '1F497D', font: 'Times New Roman' }),
      ],
    });

    if (resumeData.employmentHistory && resumeData.employmentHistory.length > 0) {
      const sortedEmploymentHistory = [...resumeData.employmentHistory];

      sortedEmploymentHistory.forEach((job, index) => {
        const formattedJobLocation = formatEmploymentLocation(job.location || '');
        const departmentOrSubRole = (job.department || job.subRole || '').trim();

        // Spacer between entries — PATTERN B: after=200, line=276 (visible gap)
        if (index > 0) {
          paragraphs.push(new Paragraph({ spacing: { after: 200, line: 276, lineRule: 'auto' }, children: [] }));
        }

        // Company name (left) + date range (right) — single paragraph with right tab
        paragraphs.push(hdrTabPara(job.companyName || 'Company', job.workPeriod || ''));

        // Job title (left) + location (right, if present)
        if (formattedJobLocation) {
          paragraphs.push(hdrTabPara(job.roleName || 'Role', formattedJobLocation));
        } else {
          paragraphs.push(
            new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: bodySpacing, children: [hdrRun(job.roleName || 'Role')] })
          );
        }

        if (departmentOrSubRole) {
          paragraphs.push(
            new Paragraph({
              alignment: AlignmentType.JUSTIFIED,
              spacing: bodySpacing,
              children: [new TextRun({ text: departmentOrSubRole, font: 'Calibri' })],
            })
          );
        }

        // Projects
        if (job.projects && job.projects.length > 0) {
          const totalProjects = job.projects.length;
          job.projects.forEach((project, projectIndex) => {
            const projectForTitle = { ...project, projectLocation: project.projectLocation || job.location || '' };
            const projectTitle = formatProjectTitle(projectForTitle, projectIndex, totalProjects);

            paragraphs.push(
              new Paragraph({
                alignment: AlignmentType.JUSTIFIED,
                spacing: bodySpacing,
                children: [new TextRun({ text: projectTitle, bold: true, font: 'Calibri' })],
              })
            );

            // Project responsibilities
            if (project.projectResponsibilities && project.projectResponsibilities.length > 0) {
              paragraphs.push(
                new Paragraph({
                  alignment: AlignmentType.JUSTIFIED,
                  spacing: bodySpacing,
                  children: [new TextRun({ text: 'Responsibilities', bold: true, font: 'Calibri' })],
                })
              );
              project.projectResponsibilities.forEach(responsibility => {
                if (responsibility.trim()) paragraphs.push(bulletPara(responsibility));
              });
            }

            // Project key technologies
            if (project.keyTechnologies) {
              // Empty para (after=0) separates bullets from Key Technologies line
              paragraphs.push(new Paragraph({ spacing: bodySpacing, children: [] }));
              paragraphs.push(
                new Paragraph({
                  alignment: AlignmentType.JUSTIFIED,
                  spacing: bodySpacing,
                  children: [
                    new TextRun({ text: 'Key Technologies/Skills', bold: true, boldComplexScript: true, font: 'Calibri' }),
                    new TextRun({ text: ': ', font: 'Calibri' }),
                    new TextRun({ text: project.keyTechnologies, boldComplexScript: true, font: 'Calibri' }),
                  ],
                })
              );
            }
          });
        }

        // General responsibilities
        if (job.responsibilities && job.responsibilities.length > 0 && job.responsibilities.some(r => r.trim())) {
          paragraphs.push(
            new Paragraph({
              alignment: AlignmentType.JUSTIFIED,
              spacing: bodySpacing,
              children: [new TextRun({ text: 'Responsibilities', bold: true, font: 'Calibri' })],
            })
          );
          job.responsibilities.forEach(resp => {
            if (resp.trim()) paragraphs.push(bulletPara(resp));
          });
        }

        // Subsections
        if (job.subsections && job.subsections.length > 0) {
          job.subsections.forEach(subsection => {
            if (subsection.title) {
              paragraphs.push(
                new Paragraph({
                  alignment: AlignmentType.JUSTIFIED,
                  spacing: bodySpacing,
                  children: [new TextRun({ text: subsection.title + ':', bold: true, font: 'Calibri' })],
                })
              );
              if (subsection.content && subsection.content.length > 0) {
                subsection.content.forEach(item => {
                  if (item.trim()) paragraphs.push(bulletPara(item));
                });
              }
            }
          });
        }

        // Job-level key technologies
        if (job.keyTechnologies) {
          // Empty para (after=0) separates bullets from Key Technologies line
          paragraphs.push(new Paragraph({ spacing: bodySpacing, children: [] }));
          paragraphs.push(
            new Paragraph({
              alignment: AlignmentType.JUSTIFIED,
              spacing: bodySpacing,
              children: [
                new TextRun({ text: 'Key Technologies/Skills', bold: true, boldComplexScript: true, font: 'Calibri' }),
                new TextRun({ text: ': ', font: 'Calibri' }),
                new TextRun({ text: job.keyTechnologies, boldComplexScript: true, font: 'Calibri' }),
              ],
            })
          );
        }
      });
    } else {
      paragraphs.push(
        new Paragraph({
          spacing: bodySpacing,
          children: [new TextRun({ text: 'No employment history', font: 'Calibri' })],
        })
      );
    }

    return paragraphs;
  };

  // Helper function to create technical skills content
  const createTechnicalSkills = (resumeData) => {
    const paragraphs = [];
    const skillSpacing = { after: 0, line: 240, lineRule: 'auto' };

    // Legacy format skills
    if (resumeData.technicalSkills && Object.keys(resumeData.technicalSkills).length > 0) {
      Object.entries(resumeData.technicalSkills).forEach(([category, skills]) => {
        paragraphs.push(
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            spacing: skillSpacing,
            children: [
              new TextRun({ text: category + ': ', bold: true, boldComplexScript: true, font: 'Calibri' }),
              new TextRun({ text: (Array.isArray(skills) ? skills.join(', ') : skills), boldComplexScript: true, font: 'Calibri' }),
            ],
          })
        );
      });
    }

    // Nested skill categories
    if (resumeData.skillCategories && resumeData.skillCategories.length > 0) {
      // Safety net: if AI returned flat entries (individual skill names with empty skills array),
      // consolidate them under an "Other Technical Skills" category so they render as one line.
      const normalCategories = [];
      const flatEntries = []; // entries where skills[] is empty — these are misclassified individual skills

      resumeData.skillCategories.forEach(category => {
        const skillList = Array.isArray(category.skills) ? category.skills.filter(s => s && s.trim()) : [];
        if (skillList.length === 0 && (!category.subCategories || category.subCategories.length === 0)) {
          // Treat the categoryName itself as an individual skill
          flatEntries.push(category.categoryName || '');
        } else {
          normalCategories.push({ ...category, skills: skillList });
        }
      });

      // Re-attach consolidated flat skills as one category at the end
      if (flatEntries.length > 0) {
        normalCategories.push({ categoryName: 'Other Technical Skills', skills: flatEntries, subCategories: [] });
      }

      normalCategories.forEach(category => {
        paragraphs.push(
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            spacing: skillSpacing,
            children: [
              new TextRun({ text: (category.categoryName || 'Category') + ': ', bold: true, boldComplexScript: true, font: 'Calibri' }),
              new TextRun({
                text: Array.isArray(category.skills) ? category.skills.join(', ') : (category.skills || ''),
                boldComplexScript: true,
                font: 'Calibri',
              }),
            ],
          })
        );

        if (category.subCategories && Array.isArray(category.subCategories) && category.subCategories.length > 0) {
          category.subCategories.forEach(subCategory => {
            paragraphs.push(
              new Paragraph({
                alignment: AlignmentType.JUSTIFIED,
                spacing: skillSpacing,
                indent: { left: 350 },
                children: [
                  new TextRun({ text: (subCategory.name || 'Subcategory') + ': ', bold: true, boldComplexScript: true, font: 'Calibri' }),
                  new TextRun({
                    text: Array.isArray(subCategory.skills) ? subCategory.skills.join(', ') : (subCategory.skills || ''),
                    boldComplexScript: true,
                    font: 'Calibri',
                  }),
                ],
              })
            );
          });
        }
      });
    }

    if (paragraphs.length === 0) {
      paragraphs.push(
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: skillSpacing,
          children: [new TextRun({ text: 'No skills provided', font: 'Calibri' })],
        })
      );
    }

    return paragraphs;
  };

  // Helper function to handle Word document generation and download
  const handleDownloadWord = async () => {
    if (!resumeData) return;

    setIsGenerating(true);

    try {
      // Shared section-header run factory: Times New Roman 14pt bold #1F497D
      const sectionHdrRun = (text) => new TextRun({
        text,
        bold: true,
        size: 28,
        color: '1F497D',
        font: 'Times New Roman',
      });

      // Shared section header paragraph: justified, PATTERN B (after=200, line=276)
      const sectionHdr = (text) => new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        spacing: { after: 200, line: 276, lineRule: 'auto' },
        children: [sectionHdrRun(text)],
      });

      // Shared spacing for the title-section rows
      const titleSpacing = { after: 0, line: 240, lineRule: 'auto' };

      // Create a new Word document
      const doc = new Document({
        // Document-level default font: Calibri (ensures table cells default to Calibri, not TNR)
        styles: {
          default: {
            document: {
              run: {
                font: { ascii: 'Calibri', hAnsi: 'Calibri', eastAsia: 'Calibri', cs: 'Times New Roman' },
              },
            },
          },
          paragraphStyles: [
            {
              id: 'ListParagraph',
              name: 'List Paragraph',
              basedOn: 'Normal',
              quickFormat: true,
              paragraph: {
                indent: { left: 360, hanging: 360 },
                contextualSpacing: true,
              },
            },
          ],
        },
        // Bullet list numbering definition (Symbol font \uF0B7, bullet at 720 left, hanging 360)
        numbering: {
          config: [
            {
              reference: 'resumeBullet',
              levels: [
                {
                  level: 0,
                  format: LevelFormat.BULLET,
                  text: '\uF0B7',
                  alignment: AlignmentType.LEFT,
                  style: {
                    paragraph: { indent: { left: 360, hanging: 360 } },
                    run: { font: 'Symbol' },
                  },
                },
              ],
            },
          ],
        },
        sections: [
          {
            properties: {
              page: {
                size: { width: 12240, height: 15840 },
                margin: { top: 720, right: 720, bottom: 720, left: 720, header: 288, footer: 288, gutter: 0 },
              },
            },
            children: [
              // ── Candidate Name ──────────────────────────────────────────
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 0, line: 240, lineRule: 'auto' },
                children: [
                  new TextRun({
                    text: resumeData.name || 'Full Name',
                    bold: true,
                    size: 36,
                    color: '1F497D',
                    font: 'Times New Roman',
                  }),
                ],
              }),

              // ── Title/Role label | VectorVMS label (line 2) ─────────────
              // ── Title/Role value | VectorVMS value (line 3) ─────────────
              // Single paragraphs with right-aligned tab stop
              new Paragraph({
                tabStops: [{ type: TabStopType.RIGHT, position: 10800 }],
                spacing: titleSpacing,
                children: [
                  new TextRun({ text: 'Title/Role:', bold: true, size: 28, color: '1F497D', font: 'Times New Roman' }),
                  new TextRun({ text: '\t' }),
                  new TextRun({ text: 'VectorVMS Requisition Number:', bold: true, size: 28, color: '1F497D', font: 'Times New Roman' }),
                ],
              }),
              new Paragraph({
                tabStops: [{ type: TabStopType.RIGHT, position: 10800 }],
                alignment: AlignmentType.JUSTIFIED,
                spacing: titleSpacing,
                children: [
                  new TextRun({ text: resumeData.title || '' }),
                  new TextRun({ text: '\t' }),
                  new TextRun({ text: resumeData.requisitionNumber || '' }),
                ],
              }),

              // ── Spacer: tight single blank line before Education section ──
              new Paragraph({ spacing: { after: 0, line: 240, lineRule: 'auto' }, children: [] }),

              // ── Education ───────────────────────────────────────────────
              sectionHdr('Education:'),
              createEducationTable(resumeData),

              // ── Spacer (PATTERN B) before Certifications section ────────
              new Paragraph({ spacing: { after: 200, line: 276, lineRule: 'auto' }, children: [] }),

              // ── Certifications ──────────────────────────────────────────
              sectionHdr('Certifications and Certificates:'),
              createCertificationsTable(resumeData),

              // ── Spacer (PATTERN B) before Employment History section ─────
              new Paragraph({ spacing: { after: 200, line: 276, lineRule: 'auto' }, children: [] }),

              // ── Employment History ──────────────────────────────────────
              sectionHdr('Employment History:'),
              ...createEmploymentHistory(resumeData),

              // ── Professional Summary ────────────────────────────────────
              new Paragraph({ spacing: { after: 200, line: 276, lineRule: 'auto' }, children: [] }),
              sectionHdr('Professional Summary'),

              // Bullet points (always bulleted — consistent with template)
              ...(resumeData.professionalSummary || []).map(point =>
                new Paragraph({
                  numbering: { reference: 'resumeBullet', level: 0 },
                  alignment: AlignmentType.JUSTIFIED,
                  spacing: { after: 0, line: 240, lineRule: 'auto' },
                  children: [
                    new TextRun({ text: stripBullet(point), font: 'Calibri', boldComplexScript: true }),
                  ],
                })
              ),

              // Summary subsections — no bullets, plain paragraphs
              ...(resumeData.summarySections || resumeData.subsections || []).flatMap(subsection => [
                ...(subsection.title ? [new Paragraph({
                  alignment: AlignmentType.JUSTIFIED,
                  spacing: { after: 0, line: 240, lineRule: 'auto' },
                  children: [new TextRun({ text: subsection.title, bold: true, font: 'Calibri' })],
                })] : []),
                ...(subsection.content && subsection.content.length > 0
                  ? subsection.content.map(item =>
                      new Paragraph({
                        alignment: AlignmentType.JUSTIFIED,
                        spacing: { after: 0, line: 240, lineRule: 'auto' },
                        children: [new TextRun({ text: item, font: 'Calibri' })],
                      })
                    )
                  : []
                ),
              ]),

              // ── Technical Skills ────────────────────────────────────────
              new Paragraph({ spacing: { after: 200, line: 276, lineRule: 'auto' }, children: [] }),
              sectionHdr('Technical Skills'),
              ...createTechnicalSkills(resumeData),
            ],
          },
        ],
      });

      // Generate and save the document
      const blob = await Packer.toBlob(doc);
      saveAs(blob, `${resumeData.name || 'Resume'}.docx`);
    } catch (error) {
      alert('Error generating Word document. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className={previewMode ? 'flex flex-col h-full' : 'max-w-4xl mx-auto animate-slide-up'}>

      {/* ── Sticky action bar ── */}
      <div className={`sticky top-0 z-10 border-b border-gray-200 shadow-sm ${
        previewMode
          ? 'bg-gradient-to-r from-ocean-dark to-[#0b6cb5] px-5 py-3'
          : 'bg-white px-6 py-4'
      }`}>
        {previewMode ? (
          /* Compact preview-mode bar */
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 rounded-full bg-ocean-blue animate-pulse" />
              <span className="text-white text-sm font-semibold tracking-wide">Live Preview</span>
              <span className="text-blue-300 text-xs">— updates as you edit</span>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={handlePrint}
                className="flex items-center px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-medium transition-all border border-white/20"
              >
                <FiPrinter className="mr-1.5 text-sm" /> Print
              </button>
              <button
                onClick={handleDownloadWord}
                disabled={isGenerating}
                className="flex items-center px-4 py-1.5 bg-white text-ocean-dark hover:bg-blue-50 rounded-lg text-xs font-bold transition-all shadow-md"
              >
                <FiDownload className="mr-1.5 text-sm" />
                {isGenerating ? 'Generating…' : 'Download Word'}
              </button>
            </div>
          </div>
        ) : (
          /* Full-page mode bar */
          <div>
            <PricingDisplay resumeData={resumeData} />
            <div className="text-center mb-4">
              <h2 className="text-3xl font-bold text-ocean-dark mb-2">Generated Resume</h2>
            </div>
            <div className="flex justify-center space-x-4">
              <button
                onClick={handlePrint}
                className="px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg flex items-center transition-colors"
              >
                <FiPrinter className="mr-2" /> Print Resume
              </button>
              <button
                onClick={handleDownloadWord}
                className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg flex items-center transition-colors"
                disabled={isGenerating}
              >
                <FiDownload className="mr-2" /> {isGenerating ? 'Generating...' : 'Download Word'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Pricing (preview mode only, below bar) ── */}
      {previewMode && <PricingDisplay resumeData={resumeData} />}

      {/* Resume Preview */}
      <div className={`bg-white print:shadow-none ${
        previewMode
          ? 'mx-4 my-4 rounded-xl shadow-md border border-gray-200 p-6'
          : 'border-2 border-gray-200 rounded-2xl p-8 shadow-xl mt-6'
      }`} id="resume-preview">
        {/* Header */}
        <header className="border-b-2 border-ocean-blue pb-6 mb-6">
          <h1 className="text-4xl font-bold text-center mb-3 text-ocean-dark">{resumeData.name || 'Full Name'}</h1>
          <p className="text-xl text-center text-ocean-blue mb-4 font-medium">{resumeData.title || 'Professional Title'}</p>

          {resumeData.requisitionNumber && (
            <p className="text-center text-gray-600 bg-gray-50 py-2 px-4 rounded-lg inline-block">
              <span className="font-medium">Requisition Number:</span> {resumeData.requisitionNumber}
            </p>
          )}
        </header>

        {/* Education */}
        {sortedEducation.length > 0 && (
          <section className="mb-6">
            <h2 className="text-xl font-semibold border-b pb-2 mb-3">Education</h2>

            {sortedEducation.map((edu, index) => (
              <div key={index} className="mb-3">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold">{edu.degree || 'Degree'} {edu.areaOfStudy ? `in ${edu.areaOfStudy}` : ''}</h3>
                    <p className="text-gray-800">{edu.school || 'Institution'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-gray-600">{edu.date || 'Date'}</p>
                    <p className="text-gray-600">{getEducationCountry(edu.location) || 'Location'}</p>
                  </div>
                </div>
                <p className="text-gray-600">{edu.wasAwarded ? 'Degree awarded' : 'Degree in progress'}</p>
              </div>
            ))}
          </section>
        )}

        {/* Certifications */}
        {resumeData.certifications && resumeData.certifications.length > 0 && (
          <section className="mb-6">
            <h2 className="text-xl font-semibold border-b pb-2 mb-3">Certifications</h2>

            {resumeData.certifications.map((cert, index) => (
              <div key={index} className="mb-3">
                <h3 className="font-bold">{cert.name || 'Certification'}</h3>
                <p className="text-gray-800">
                  {cert.issuedBy ? `Issued by: ${cert.issuedBy}` : ''}
                  {cert.dateObtained ? ` • Obtained: ${cert.dateObtained}` : ''}
                </p>
                {cert.expirationDate && (
                  <p className="text-gray-600">Expires: {cert.expirationDate}</p>
                )}
                {cert.certificationNumber && (
                  <p className="text-gray-600">Certification #: {cert.certificationNumber}</p>
                )}
              </div>
            ))}
          </section>
        )}

        {/* Work Experience */}
        {resumeData.employmentHistory && resumeData.employmentHistory.length > 0 && (
          <section className="mb-6">
            <h2 className="text-xl font-semibold border-b-2 border-ocean-blue pb-2 mb-4 text-ocean-dark">Employment History</h2>

            {resumeData.employmentHistory.map((job, index) => {
              const formattedJobLocation = formatEmploymentLocation(job.location || '');
              const departmentOrSubRole = (job.department || job.subRole || '').trim();

              return (
                <div key={index} className="mb-6">
                  {/* LINE 1: Company Name (left)  |  Employment Period (right) */}
                  <div className="flex justify-between items-baseline">
                    <h3 className="font-bold text-lg text-blue-900">{job.companyName || 'Company Name'}</h3>
                    <span className="text-gray-700 font-semibold text-sm whitespace-nowrap ml-4">{job.workPeriod || ''}</span>
                  </div>
                  {/* LINE 2: Job Title (left)  |  Location (right, only if available) */}
                  <div className="flex justify-between items-baseline">
                    <p className="font-medium text-gray-800">{job.roleName || 'Role'}</p>
                    {formattedJobLocation && (
                      <span className="text-gray-600 text-sm whitespace-nowrap ml-4">{formattedJobLocation}</span>
                    )}
                  </div>
                  {/* LINE 3: Department / Sub-Role (if present) */}
                  {departmentOrSubRole && (
                    <p className="text-sm text-gray-700 mt-0.5">{departmentOrSubRole}</p>
                  )}

                  {job.description && (
                    <p className="my-2 text-gray-800">{job.description}</p>
                  )}

                  {/* Projects */}
                  {job.projects && job.projects.length > 0 && (
                    <div className="mt-3">
                      {job.projects.map((project, projIndex) => {
                        const totalProjects = job.projects.length;
                        const projectForTitle = {
                          ...project,
                          projectLocation: project.projectLocation || job.location || ''
                        };
                        const projectTitle = formatProjectTitle(projectForTitle, projIndex, totalProjects);

                        return (
                          <div key={projIndex} className="border-l-2 border-blue-200 pl-4 mb-3 bg-blue-50 p-3 rounded">
                            {/* Project name (left) | Period (right) — dates NEVER next to project name inline */}
                            <div className="flex justify-between items-baseline gap-4 mb-1">
                              <h5 className="font-semibold text-blue-900">
                                {projectTitle}
                              </h5>
                            </div>
                            {project.keyTechnologies && (
                              <p className="text-sm text-gray-600 mb-2">
                                <span className="font-medium">Technologies: </span>
                                {project.keyTechnologies}
                              </p>
                            )}
                            {project.projectResponsibilities && project.projectResponsibilities.length > 0 && (
                              <ul className="list-disc pl-5 space-y-1">
                                {project.projectResponsibilities.map((resp, respIndex) => (
                                  <li key={respIndex} className="text-gray-800 text-sm">{stripBullet(resp)}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                {job.responsibilities && job.responsibilities.length > 0 && (
                  <div className="mt-2">
                    <p className="font-medium">Responsibilities:</p>
                    <ul className="list-disc pl-5 space-y-1">
                      {job.responsibilities.map((resp, respIndex) => (
                        <li key={respIndex} className="text-gray-800">{stripBullet(resp)}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Subsections */}
                {job.subsections && job.subsections.length > 0 && job.subsections.map((subsection, subIndex) => (
                  <div key={subIndex} className="mt-3">
                    {subsection.title && (
                      <p className="font-medium">{subsection.title}:</p>
                    )}
                    {subsection.content && subsection.content.length > 0 && (
                      <ul className="list-disc pl-5 space-y-1">
                        {subsection.content.map((item, itemIndex) => (
                          <li key={itemIndex} className="text-gray-800">{stripBullet(item)}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}

                {job.keyTechnologies && (
                  <p className="mt-2">
                    <span className="font-medium">Key Technologies/Skills: </span>
                    <span className="text-gray-800">{job.keyTechnologies}</span>
                  </p>
                )}

                </div>
              );
            })}
          </section>
        )}

        {/* Professional Summary */}
        {(resumeData.professionalSummary && resumeData.professionalSummary.length > 0) ||
          (resumeData.summarySections && resumeData.summarySections.length > 0) ||
          (resumeData.subsections && resumeData.subsections.length > 0) ? (
          <section className="mb-6">
            <h2 className="text-xl font-semibold border-b-2 border-ocean-blue pb-2 mb-4 text-ocean-dark">Professional Summary</h2>

            {/* Main summary points — bullet points when multiple */}
            {resumeData.professionalSummary && resumeData.professionalSummary.length > 0 && (
              <div className="mb-4">
                {resumeData.professionalSummary.length > 1 ? (
                  <ul className="space-y-1 pl-1">
                    {resumeData.professionalSummary.map((point, index) => (
                      <li key={index} className="flex items-start text-gray-800 text-justify">
                        <span className="mr-2 mt-0.5 text-ocean-dark flex-shrink-0">•</span>
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-gray-800 text-justify">{resumeData.professionalSummary[0]}</p>
                )}
              </div>
            )}

            {/* Summary subsections - support both formats, no bullets */}
            {(resumeData.summarySections || resumeData.subsections) &&
              ((resumeData.summarySections && resumeData.summarySections.length > 0) ||
                (resumeData.subsections && resumeData.subsections.length > 0)) && (
                <div className="mt-4 space-y-3">
                  {(resumeData.summarySections || resumeData.subsections).map((subsection, index) => (
                    <div key={index} className="pl-3 py-1">
                      {subsection.title && (
                        <h4 className="font-medium text-gray-800">{subsection.title}</h4>
                      )}
                      {subsection.content && subsection.content.length > 0 ? (
                        <div className="space-y-1">
                          {subsection.content.map((item, itemIndex) => (
                            <p key={itemIndex} className="text-gray-800 text-justify">{item}</p>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
          </section>
        ) : null}

        {/* Technical Skills */}
        {(resumeData.technicalSkills && Object.keys(resumeData.technicalSkills).length > 0) ||
          (resumeData.skillCategories && resumeData.skillCategories.length > 0) ? (
          <section className="mb-6">
            <h2 className="text-xl font-semibold border-b pb-2 mb-3">Technical Skills</h2>

            {/* Legacy format skills */}
            {resumeData.technicalSkills && Object.keys(resumeData.technicalSkills).length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                {Object.entries(resumeData.technicalSkills).map(([category, skills]) => (
                  <div key={category} className="border-l-2 border-blue-100 pl-3 py-1">
                    <h3 className="font-bold">{category}</h3>
                    <p className="text-gray-800">{Array.isArray(skills) ? skills.join(', ') : skills}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Nested skill categories */}
            {resumeData.skillCategories && resumeData.skillCategories.length > 0 && (
              <div className="space-y-5">
                {resumeData.skillCategories.map((category, index) => (
                  <div key={index} className="border-l-4 border-blue-200 pl-4 py-2">
                    <h3 className="font-bold text-lg text-blue-800">{category.categoryName || 'Category'}</h3>

                    {/* Main skills */}
                    {category.skills && category.skills.length > 0 && (
                      <p className="text-gray-800 mb-3 mt-1">
                        {Array.isArray(category.skills) ? category.skills.join(', ') : category.skills}
                      </p>
                    )}

                    {/* Subcategories */}
                    {category.subCategories && Array.isArray(category.subCategories) && category.subCategories.length > 0 && (
                      <div className="ml-4 mt-3 space-y-3">
                        {category.subCategories.map((subCategory, subIndex) => (
                          <div key={subIndex} className="border-l-2 border-gray-300 pl-3 py-1">
                            <h4 className="font-medium text-gray-700">{subCategory.name || 'Subcategory'}</h4>
                            {subCategory.skills && subCategory.skills.length > 0 && (
                              <ul className="list-disc pl-5 space-y-1 mt-1">
                                {Array.isArray(subCategory.skills) ?
                                  subCategory.skills.map((skill, skillIndex) => (
                                    <li key={skillIndex} className="text-gray-800">{skill}</li>
                                  )) :
                                  <li className="text-gray-800">{subCategory.skills}</li>
                                }
                              </ul>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : null}
      </div>

    </div>
  );
};

export default GeneratedResume;