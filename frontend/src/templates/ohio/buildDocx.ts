import {
  Document, Packer, Paragraph, Table, TableCell, TableRow,
  TextRun, BorderStyle, AlignmentType, WidthType, ShadingType,
  VerticalAlign, LevelFormat, TabStopType,
} from 'docx';
import { saveAs } from 'file-saver';
import type { ResumeData } from '@/types/resume';

// ── Shared helpers ──────────────────────────────────────────────────────────

const stripBullet = (t = '') =>
  t.replace(/^[\u2022\u25CF\u25E6\u2023\u2043\u2219\u00B7\u25CB\u25AA\u25B8\-\u2013\u2014*]\s*/, '').trim();

const normalizeMonthAbbr = (s = '') => {
  if (typeof s !== 'string') return s;
  const map: Record<string, string> = {
    january:'Jan', february:'Feb', march:'Mar', april:'Apr',
    june:'Jun', july:'Jul', august:'Aug',
    september:'Sep', october:'Oct', november:'Nov', december:'Dec',
    sept:'Sep', octo:'Oct',
  };
  return s.replace(/\b(january|february|march|april|june|july|august|september|october|november|december|sept|octo)\b/gi, m => map[m.toLowerCase()] || m);
};

const splitBulletItems = (t = '') => {
  if (!t || typeof t !== 'string') return [t];
  if (!t.includes('\u2022') && !t.includes(' • ')) return [t];
  return t.split(/\s*[•\u2022]\s*/).map(s => s.trim()).filter(Boolean);
};

const normalizeDegree = (d = '') => d.toUpperCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
const degreeRank = (d = '') => {
  const n = normalizeDegree(d); const c = n.replace(/\s+/g, '');
  if (/\b(AA|AS|ASSOCIATE)\b/.test(n)) return 1;
  if (/\b(BA|BS|BSC|BACHELOR|BE)\b/.test(n) || /BTECH/.test(c)) return 2;
  if (/\b(MA|MS|MBA|MASTER)\b/.test(n) || /MTECH/.test(c)) return 3;
  if (/\b(PHD|DOCTOR|DOCTORATE|DOCTORAL)\b/.test(n)) return 4;
  return 5;
};
const sortEducation = <T extends { degree?: string }>(arr: T[]) =>
  arr.map((e, i) => ({ e, i, r: degreeRank(e.degree) })).sort((a, b) => a.r - b.r || a.i - b.i).map(x => x.e);

// ── Location helpers ────────────────────────────────────────────────────────

const INDIA_STATES = new Set(['andhra pradesh','arunachal pradesh','assam','bihar','chhattisgarh','goa','gujarat','haryana','himachal pradesh','jharkhand','karnataka','kerala','madhya pradesh','maharashtra','manipur','meghalaya','mizoram','nagaland','odisha','orissa','punjab','rajasthan','sikkim','tamil nadu','telangana','tripura','uttar pradesh','uttarakhand','west bengal','delhi','ncr','chandigarh','puducherry','pondicherry','jammu and kashmir','ladakh','lakshadweep']);
const US_STATE_ABBREVS = new Set(['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC']);
const US_STATE_NAME_MAP: Record<string, string> = {'Alabama':'AL','Alaska':'AK','Arizona':'AZ','Arkansas':'AR','California':'CA','Colorado':'CO','Connecticut':'CT','Delaware':'DE','Florida':'FL','Georgia':'GA','Hawaii':'HI','Idaho':'ID','Illinois':'IL','Indiana':'IN','Iowa':'IA','Kansas':'KS','Kentucky':'KY','Louisiana':'LA','Maine':'ME','Maryland':'MD','Massachusetts':'MA','Michigan':'MI','Minnesota':'MN','Mississippi':'MS','Missouri':'MO','Montana':'MT','Nebraska':'NE','Nevada':'NV','New Hampshire':'NH','New Jersey':'NJ','New Mexico':'NM','New York':'NY','North Carolina':'NC','North Dakota':'ND','Ohio':'OH','Oklahoma':'OK','Oregon':'OR','Pennsylvania':'PA','Rhode Island':'RI','South Carolina':'SC','South Dakota':'SD','Tennessee':'TN','Texas':'TX','Utah':'UT','Vermont':'VT','Virginia':'VA','Washington':'WA','West Virginia':'WV','Wisconsin':'WI','Wyoming':'WY','District of Columbia':'DC'};

function resolveUSStateAbbrev(seg = '') {
  const u = seg.trim().toUpperCase();
  if (US_STATE_ABBREVS.has(u)) return u;
  const lc = seg.trim().toLowerCase();
  const found = Object.entries(US_STATE_NAME_MAP).find(([name]) => name.toLowerCase() === lc);
  return found ? found[1] : null;
}

function formatLocation(loc = '') {
  const raw = (typeof loc === 'string' ? loc : '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  const parts = raw.split(',').map(p => p.trim()).filter(Boolean);
  if (parts.some(p => /\bindia\b/i.test(p)) || parts.some(p => INDIA_STATES.has(p.toLowerCase()))) return 'India';
  for (const part of parts) {
    if (/^\d+$/.test(part)) continue;
    const a = resolveUSStateAbbrev(part);
    if (a) return a;
  }
  if (parts.some(p => /\b(united states of america|united states|usa|u\.s\.a?\.)?\b/i.test(p))) return 'United States';
  return raw;
}

function getEdLocation(loc = '') {
  const raw = (typeof loc === 'string' ? loc : '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  const parts = raw.split(',').map(p => p.trim()).filter(Boolean);
  if (parts.some(p => /\bindia\b/i.test(p))) return 'India';
  for (const p of parts) { if (/^\d+$/.test(p)) continue; const a = resolveUSStateAbbrev(p); if (a) return a; }
  if (parts.some(p => /\b(united states|usa)\b/i.test(p))) return 'United States';
  return parts[parts.length - 1] || raw;
}

// ── Project title formatter ─────────────────────────────────────────────────

const MONTH_PAT = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

function formatProjectTitle(proj: Record<string, unknown>, idx: number, total: number) {
  const rawName = (proj.projectName || proj.title || proj.name || proj.projectTitle || '') as string;
  const rawLoc  = (proj.projectLocation || '') as string;
  let clean = rawName.replace(/\s+/g, ' ').trim();
  clean = clean.replace(/^\s*project\s*\d*\s*[:\-–—]\s*/i, '').replace(/^\s*project\s*\d+\s+/i, '');
  [
    new RegExp(`\\(?\\b${MONTH_PAT}\\.?\\s+\\d{4}\\s*[-–—]\\s*(?:${MONTH_PAT}\\.?\\s+\\d{4}|present|current)\\b\\)?`, 'gi'),
    /\(?\b\d{4}\s*[-–—]\s*(?:\d{4}|present|current)\b\)?/gi,
  ].forEach(re => { clean = clean.replace(re, ' '); });
  if (rawLoc.trim()) {
    const esc = rawLoc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    clean = clean.replace(new RegExp(`\\s*[-–—,:|]?\\s*${esc}\\s*`, 'ig'), ' ');
  }
  clean = clean.replace(/\s{2,}/g, ' ').replace(/^[-–—,:|()\s]+|[-–—,:|()\s]+$/g, '').trim() || rawName.trim().slice(0, 60) || 'Project';
  return total > 1 ? `Project ${idx + 1}: ${clean}` : clean;
}

// ── DOCX builders ───────────────────────────────────────────────────────────

const bodySpacing = { after: 0, line: 240, lineRule: 'auto' as const };
const RIGHT_TAB   = { type: TabStopType.RIGHT, position: 10800 };

const hdrTabPara = (left: string, right: string, spaceBefore = 0) =>
  new Paragraph({
    tabStops: [RIGHT_TAB],
    alignment: AlignmentType.JUSTIFIED,
    spacing: { ...bodySpacing, before: spaceBefore },
    children: [
      new TextRun({ text: left,  bold: true, boldComplexScript: true, size: 28, color: '1F497D', font: 'Times New Roman' }),
      new TextRun({ text: '\t' }),
      new TextRun({ text: right, bold: true, boldComplexScript: true, size: 28, color: '1F497D', font: 'Times New Roman' }),
    ],
  });

const bulletPara = (text: string) =>
  new Paragraph({
    numbering: { reference: 'resumeBullet', level: 0 },
    alignment: AlignmentType.JUSTIFIED,
    spacing: bodySpacing,
    children: [new TextRun({ text: stripBullet(text), font: 'Calibri', size: 22, boldComplexScript: true })],
  });

function buildEducationTable(data: ResumeData) {
  const eduHdrCell = (w: number, runs: TextRun[]) => new TableCell({
    width: { size: w, type: WidthType.DXA },
    shading: { fill: 'D9D9D9', type: ShadingType.CLEAR },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0, line: 240, lineRule: 'auto' }, children: runs })],
  });
  const eduDataCell = (text: string) => new TableCell({
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0, line: 240, lineRule: 'auto' }, children: [new TextRun({ text: text || '-', font: 'Calibri', size: 22 })] })],
  });

  const sorted = sortEducation(data.education || []);
  const rows = [
    new TableRow({
      tableHeader: true,
      children: [
        eduHdrCell(1653, [new TextRun({ text: 'Degree ', bold: true, font: 'Arial', size: 20 }), new TextRun({ text: '(AA/AS, BA/BS, BS/BTech/BE, MS/MTech/MBA/MA, PhD/Doctoral)', font: 'Arial', size: 20 })]),
        eduHdrCell(1901, [new TextRun({ text: 'Area of Study', bold: true, font: 'Arial', size: 20 })]),
        eduHdrCell(2684, [new TextRun({ text: 'School/College/University', bold: true, font: 'Arial', size: 20 })]),
        eduHdrCell(1712, [new TextRun({ text: 'Location', bold: true, font: 'Arial', size: 20 })]),
        eduHdrCell(1524, [new TextRun({ text: 'Was the degree awarded?', bold: true, font: 'Arial', size: 20 }), new TextRun({ text: ' (Yes/No)', font: 'Arial', size: 20 })]),
        eduHdrCell(1316, [new TextRun({ text: 'OPTIONAL: Date', bold: true, font: 'Arial', size: 20 }), new TextRun({ text: ' (MM/YY)', font: 'Arial', size: 20 })]),
      ],
    }),
    ...(sorted.length > 0
      ? sorted.map(edu => new TableRow({ height: { value: 58, rule: 'atLeast' }, cantSplit: true, children: [eduDataCell(edu.degree), eduDataCell(edu.areaOfStudy), eduDataCell(edu.school), eduDataCell(getEdLocation(edu.location)), eduDataCell(edu.wasAwarded ? 'Yes' : 'No'), eduDataCell(edu.date)] }))
      : [new TableRow({ height: { value: 58, rule: 'atLeast' }, cantSplit: true, children: ['-','-','-','-','-','-'].map(() => eduDataCell('-')) })]
    ),
  ];

  const border = { style: BorderStyle.SINGLE, size: 4, space: 0, color: 'auto' };
  return new Table({ alignment: AlignmentType.CENTER, columnWidths: [1653,1901,2684,1712,1524,1316], rows, width: { size: 0, type: WidthType.AUTO }, borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border } });
}

function buildCertificationsTable(data: ResumeData) {
  const certHdrCell = (w: number, runs: TextRun[]) => new TableCell({
    width: { size: w, type: WidthType.DXA },
    shading: { fill: 'D9D9D9', type: ShadingType.CLEAR },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0, line: 240, lineRule: 'auto' }, children: runs })],
  });
  const certDataCell = (text: string) => new TableCell({
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0, line: 240, lineRule: 'auto' }, children: [new TextRun({ text: text || '-', font: 'Calibri', size: 22 })] })],
  });

  const rows = [
    new TableRow({
      tableHeader: true,
      children: [
        certHdrCell(3417, [new TextRun({ text: 'Certification', bold: true, font: 'Arial', size: 20 })]),
        certHdrCell(2424, [new TextRun({ text: 'Issued By', bold: true, font: 'Arial', size: 20 })]),
        certHdrCell(1834, [new TextRun({ text: 'Date Obtained', bold: true, font: 'Arial', size: 20 }), new TextRun({ text: ' (MM/YY)', font: 'Arial', size: 20 })]),
        certHdrCell(1644, [new TextRun({ text: 'Certification Number', bold: true, font: 'Arial', size: 20 }), new TextRun({ text: ' (If Applicable)', font: 'Arial', size: 20 })]),
        certHdrCell(1471, [new TextRun({ text: 'Expiration Date', bold: true, font: 'Arial', size: 20 }), new TextRun({ text: ' (If Applicable)', font: 'Arial', size: 20 })]),
      ],
    }),
    ...(data.certifications?.length > 0
      ? data.certifications.map(cert => new TableRow({ height: { value: 58, rule: 'atLeast' }, cantSplit: true, children: [certDataCell(cert.name), certDataCell(cert.issuedBy), certDataCell(cert.dateObtained), certDataCell(cert.certificationNumber), certDataCell(cert.expirationDate)] }))
      : [new TableRow({ height: { value: 58, rule: 'atLeast' }, cantSplit: true, children: ['-','-','-','-','-'].map(() => certDataCell('-')) })]
    ),
  ];

  const border = { style: BorderStyle.SINGLE, size: 4, space: 0, color: 'auto' };
  return new Table({ alignment: AlignmentType.CENTER, columnWidths: [3417,2424,1834,1644,1471], rows, width: { size: 0, type: WidthType.AUTO }, borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border } });
}

function buildEmploymentHistory(data: ResumeData): Paragraph[] {
  const paras: Paragraph[] = [];
  if (!data.employmentHistory?.length) {
    paras.push(new Paragraph({ spacing: bodySpacing, children: [new TextRun({ text: 'No employment history', font: 'Calibri', size: 22 })] }));
    return paras;
  }

  data.employmentHistory.forEach((job, idx) => {
    try {
      const loc    = formatLocation(job.location || '');
      const dept   = (job.department || job.subRole || '').trim();
      const period = normalizeMonthAbbr(job.workPeriod || '');

      paras.push(hdrTabPara(job.companyName || 'Company', period, idx > 0 ? 200 : 0));
      if (loc) paras.push(hdrTabPara(job.roleName || 'Role', loc));
      else paras.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: bodySpacing, children: [new TextRun({ text: job.roleName || 'Role', bold: true, boldComplexScript: true, size: 28, color: '1F497D', font: 'Times New Roman' })] }));
      if (dept) paras.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: bodySpacing, children: [new TextRun({ text: dept, font: 'Calibri', size: 22 })] }));

      (job.responsibilities || []).filter(r => r.trim()).forEach(r => paras.push(bulletPara(r)));

      (job.projects || []).forEach((proj, pi) => {
        const title = formatProjectTitle(proj as Record<string, unknown>, pi, job.projects.length);
        paras.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: bodySpacing, children: [new TextRun({ text: title, bold: true, font: 'Calibri', size: 22 })] }));
        if (proj.projectResponsibilities?.length) {
          paras.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: bodySpacing, children: [new TextRun({ text: 'Responsibilities', bold: true, font: 'Calibri', size: 22 })] }));
          proj.projectResponsibilities.filter(r => r.trim()).forEach(r => paras.push(bulletPara(r)));
        }
        if (proj.keyTechnologies) {
          paras.push(new Paragraph({ spacing: bodySpacing, children: [] }));
          paras.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: bodySpacing, children: [new TextRun({ text: 'Key Technologies/Skills', bold: true, boldComplexScript: true, font: 'Calibri', size: 22 }), new TextRun({ text: ': ', font: 'Calibri', size: 22 }), new TextRun({ text: proj.keyTechnologies, boldComplexScript: true, font: 'Calibri', size: 22 })] }));
        }
      });

      (job.subsections || []).forEach(sub => {
        if (sub.title) paras.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: bodySpacing, children: [new TextRun({ text: sub.title + ':', bold: true, font: 'Calibri', size: 22 })] }));
        (sub.content || []).filter(i => i.trim()).forEach(i => paras.push(bulletPara(i)));
      });

      if (job.keyTechnologies) {
        paras.push(new Paragraph({ spacing: bodySpacing, children: [] }));
        paras.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: bodySpacing, children: [new TextRun({ text: 'Key Technologies/Skills', bold: true, boldComplexScript: true, font: 'Calibri', size: 22 }), new TextRun({ text: ': ', font: 'Calibri', size: 22 }), new TextRun({ text: job.keyTechnologies, boldComplexScript: true, font: 'Calibri', size: 22 })] }));
      }
    } catch (err) {
      paras.push(new Paragraph({ spacing: bodySpacing, children: [new TextRun({ text: `[${job.companyName || 'Employment entry'} could not be rendered]`, font: 'Calibri', size: 22 })] }));
    }
  });
  return paras;
}

function buildSkills(data: ResumeData): Paragraph[] {
  const paras: Paragraph[] = [];
  const sp = { after: 0, line: 240, lineRule: 'auto' as const };

  if (data.technicalSkills && Object.keys(data.technicalSkills).length) {
    Object.entries(data.technicalSkills).forEach(([cat, skills]) => {
      paras.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: sp, children: [new TextRun({ text: cat + ': ', bold: true, boldComplexScript: true, font: 'Calibri' }), new TextRun({ text: Array.isArray(skills) ? skills.join(', ') : skills, boldComplexScript: true, font: 'Calibri' })] }));
    });
  }

  if (data.skillCategories?.length) {
    const normal: typeof data.skillCategories = [];
    const flat: string[] = [];
    data.skillCategories.forEach(c => {
      const sl = Array.isArray(c.skills) ? c.skills.filter(s => s?.trim()) : [];
      if (!sl.length && !c.subCategories?.length) flat.push(c.categoryName || '');
      else normal.push({ ...c, skills: sl });
    });
    if (flat.length) normal.push({ categoryName: 'Other Technical Skills', skills: flat, subCategories: [] });
    normal.forEach(c => {
      paras.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: sp, children: [new TextRun({ text: (c.categoryName || 'Category') + ': ', bold: true, boldComplexScript: true, font: 'Calibri' }), new TextRun({ text: Array.isArray(c.skills) ? c.skills.join(', ') : '', boldComplexScript: true, font: 'Calibri' })] }));
      (c.subCategories || []).forEach(sub => {
        paras.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: sp, indent: { left: 350 }, children: [new TextRun({ text: (sub.name || 'Subcategory') + ': ', bold: true, boldComplexScript: true, font: 'Calibri' }), new TextRun({ text: Array.isArray(sub.skills) ? sub.skills.join(', ') : '', boldComplexScript: true, font: 'Calibri' })] }));
      });
    });
  }

  if (!paras.length) paras.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: sp, children: [new TextRun({ text: 'No skills provided', font: 'Calibri' })] }));
  return paras;
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function buildDocx(data: ResumeData): Promise<void> {
  const sectionHdrRun = (t: string) => new TextRun({ text: t, bold: true, size: 28, color: '1F497D', font: 'Times New Roman' });
  const sectionHdr    = (t: string) => new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 200, line: 276, lineRule: 'auto' }, children: [sectionHdrRun(t)] });
  const tightHdr      = (t: string) => new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 0, line: 240, lineRule: 'auto' }, children: [sectionHdrRun(t)] });
  const spacer        = (after = 0) => new Paragraph({ spacing: { after, line: 240, lineRule: 'auto' }, children: [] });

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: { ascii: 'Calibri', hAnsi: 'Calibri', eastAsia: 'Calibri', cs: 'Times New Roman' }, size: 22 },
        },
      },
      paragraphStyles: [{ id: 'ListParagraph', name: 'List Paragraph', basedOn: 'Normal', quickFormat: true, paragraph: { indent: { left: 360, hanging: 360 }, contextualSpacing: true } }],
    },
    numbering: {
      config: [{
        reference: 'resumeBullet',
        levels: [{ level: 0, format: LevelFormat.BULLET, text: '\uF0B7', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 360 } }, run: { font: 'Symbol' } } }],
      }],
    },
    sections: [{
      properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 720, right: 720, bottom: 720, left: 720, header: 288, footer: 288, gutter: 0 } } },
      children: [
        // Name
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0, line: 240, lineRule: 'auto' }, children: [new TextRun({ text: data.name || 'Full Name', bold: true, size: 36, color: '1F497D', font: 'Times New Roman' })] }),
        // Title row
        new Paragraph({ tabStops: [RIGHT_TAB], spacing: bodySpacing, children: [new TextRun({ text: 'Title/Role:', bold: true, size: 28, color: '1F497D', font: 'Times New Roman' }), new TextRun({ text: '\t' }), new TextRun({ text: 'VectorVMS Requisition Number:', bold: true, size: 28, color: '1F497D', font: 'Times New Roman' })] }),
        new Paragraph({ tabStops: [RIGHT_TAB], alignment: AlignmentType.JUSTIFIED, spacing: bodySpacing, children: [new TextRun({ text: data.title || '' }), new TextRun({ text: '\t' }), new TextRun({ text: data.requisitionNumber || '' })] }),
        spacer(),
        // Education
        sectionHdr('Education:'),
        buildEducationTable(data),
        spacer(200),
        // Certifications
        sectionHdr('Certifications and Certificates:'),
        buildCertificationsTable(data),
        spacer(200),
        // Employment History
        sectionHdr('Employment History:'),
        ...buildEmploymentHistory(data),
        // Professional Summary
        spacer(),
        tightHdr('Professional Summary'),
        ...(data.professionalSummary || []).flatMap(pt =>
          splitBulletItems(pt).map(item =>
            new Paragraph({ numbering: { reference: 'resumeBullet', level: 0 }, alignment: AlignmentType.JUSTIFIED, spacing: bodySpacing, children: [new TextRun({ text: stripBullet(item), font: 'Calibri', size: 22, boldComplexScript: true })] })
          )
        ),
        ...(data.summarySections || data.subsections || []).flatMap(sec => [
          ...(sec.title ? [new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: bodySpacing, children: [new TextRun({ text: sec.title, bold: true, font: 'Calibri', size: 22 })] })] : []),
          ...(sec.content || []).map(item => new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: bodySpacing, children: [new TextRun({ text: item, font: 'Calibri', size: 22 })] })),
        ]),
        // Technical Skills
        spacer(),
        tightHdr('Technical Skills'),
        ...buildSkills(data),
      ],
    }],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${data.name || 'Resume'}.docx`);
}
