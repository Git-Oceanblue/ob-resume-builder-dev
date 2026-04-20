'use client';

import React from 'react';
import type { ResumeData } from '@/types/resume';

// ── Helpers (browser-safe, no docx imports) ─────────────────────────────────

const stripBullet = (t = '') =>
  t.replace(/^[\u2022\u25CF\u25E6\u2023\u2043\u2219\u00B7\u25CB\u25AA\u25B8\-\u2013\u2014*]\s*/, '').trim();

const normalizeMonthAbbr = (s = '') => {
  const map: Record<string, string> = { january:'Jan', february:'Feb', march:'Mar', april:'Apr', june:'Jun', july:'Jul', august:'Aug', september:'Sep', october:'Oct', november:'Nov', december:'Dec', sept:'Sep', octo:'Oct' };
  return s.replace(/\b(january|february|march|april|june|july|august|september|october|november|december|sept|octo)\b/gi, m => map[m.toLowerCase()] || m);
};

const splitBulletItems = (t = '') => {
  if (!t?.includes('\u2022') && !t?.includes(' • ')) return [t];
  return t.split(/\s*[•\u2022]\s*/).map(s => s.trim()).filter(Boolean);
};

const normDeg = (d = '') => d.toUpperCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
const degRank = (d = '') => {
  const n = normDeg(d); const c = n.replace(/\s+/g, '');
  if (/\b(AA|AS|ASSOCIATE)\b/.test(n)) return 1;
  if (/\b(BA|BS|BSC|BACHELOR|BE)\b/.test(n) || /BTECH/.test(c)) return 2;
  if (/\b(MA|MS|MBA|MASTER)\b/.test(n) || /MTECH/.test(c)) return 3;
  if (/\b(PHD|DOCTOR|DOCTORATE|DOCTORAL)\b/.test(n)) return 4;
  return 5;
};
const sortEdu = <T extends { degree?: string }>(arr: T[]) =>
  arr.map((e, i) => ({ e, i, r: degRank(e.degree) })).sort((a, b) => a.r - b.r || a.i - b.i).map(x => x.e);

const INDIA_STATES = new Set(['andhra pradesh','arunachal pradesh','assam','bihar','chhattisgarh','goa','gujarat','haryana','himachal pradesh','jharkhand','karnataka','kerala','madhya pradesh','maharashtra','manipur','meghalaya','mizoram','nagaland','odisha','orissa','punjab','rajasthan','sikkim','tamil nadu','telangana','tripura','uttar pradesh','uttarakhand','west bengal','delhi','ncr','chandigarh','puducherry','pondicherry','jammu and kashmir','ladakh','lakshadweep']);
const US_STATE_ABBREVS = new Set(['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC']);
const US_NAME_MAP: Record<string, string> = {'Alabama':'AL','Alaska':'AK','Arizona':'AZ','Arkansas':'AR','California':'CA','Colorado':'CO','Connecticut':'CT','Delaware':'DE','Florida':'FL','Georgia':'GA','Hawaii':'HI','Idaho':'ID','Illinois':'IL','Indiana':'IN','Iowa':'IA','Kansas':'KS','Kentucky':'KY','Louisiana':'LA','Maine':'ME','Maryland':'MD','Massachusetts':'MA','Michigan':'MI','Minnesota':'MN','Mississippi':'MS','Missouri':'MO','Montana':'MT','Nebraska':'NE','Nevada':'NV','New Hampshire':'NH','New Jersey':'NJ','New Mexico':'NM','New York':'NY','North Carolina':'NC','North Dakota':'ND','Ohio':'OH','Oklahoma':'OK','Oregon':'OR','Pennsylvania':'PA','Rhode Island':'RI','South Carolina':'SC','South Dakota':'SD','Tennessee':'TN','Texas':'TX','Utah':'UT','Vermont':'VT','Virginia':'VA','Washington':'WA','West Virginia':'WV','Wisconsin':'WI','Wyoming':'WY','District of Columbia':'DC'};

function resolveUSAbbrev(seg = '') {
  const u = seg.trim().toUpperCase(); if (US_STATE_ABBREVS.has(u)) return u;
  const lc = seg.trim().toLowerCase(); const f = Object.entries(US_NAME_MAP).find(([n]) => n.toLowerCase() === lc); return f ? f[1] : null;
}
function fmtLoc(loc = '') {
  const raw = (typeof loc === 'string' ? loc : '').replace(/\s+/g, ' ').trim(); if (!raw) return '';
  const parts = raw.split(',').map(p => p.trim()).filter(Boolean);
  if (parts.some(p => /\bindia\b/i.test(p)) || parts.some(p => INDIA_STATES.has(p.toLowerCase()))) return 'India';
  for (const p of parts) { if (/^\d+$/.test(p)) continue; const a = resolveUSAbbrev(p); if (a) return a; }
  return raw;
}
function fmtEdLoc(loc = '') {
  const raw = (typeof loc === 'string' ? loc : '').replace(/\s+/g, ' ').trim(); if (!raw) return '';
  const parts = raw.split(',').map(p => p.trim()).filter(Boolean);
  if (parts.some(p => /\bindia\b/i.test(p))) return 'India';
  for (const p of parts) { if (/^\d+$/.test(p)) continue; const a = resolveUSAbbrev(p); if (a) return a; }
  return parts[parts.length - 1] || raw;
}

const MONTH_PAT = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
function fmtProjTitle(proj: Record<string, unknown>, idx: number, total: number) {
  const rawName = (proj.projectName || proj.title || proj.name || '') as string;
  const rawLoc  = (proj.projectLocation || '') as string;
  let clean = rawName.replace(/\s+/g, ' ').trim().replace(/^\s*project\s*\d*\s*[:\-–—]\s*/i, '').replace(/^\s*project\s*\d+\s+/i, '');
  [new RegExp(`\\(?\\b${MONTH_PAT}\\.?\\s+\\d{4}\\s*[-–—]\\s*(?:${MONTH_PAT}\\.?\\s+\\d{4}|present|current)\\b\\)?`, 'gi'), /\(?\b\d{4}\s*[-–—]\s*(?:\d{4}|present|current)\b\)?/gi].forEach(re => { clean = clean.replace(re, ' '); });
  if (rawLoc.trim()) clean = clean.replace(new RegExp(`\\s*[-–—,:|]?\\s*${rawLoc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`, 'ig'), ' ');
  clean = clean.replace(/\s{2,}/g, ' ').replace(/^[-–—,:|()\s]+|[-–—,:|()\s]+$/g, '').trim() || rawName.trim().slice(0, 60) || 'Project';
  return total > 1 ? `Project ${idx + 1}: ${clean}` : clean;
}

// ── Section heading style ────────────────────────────────────────────────────

const SectionHead = ({ children }: { children: React.ReactNode }) => (
  <h2 className="text-[13px] font-bold text-[#1F497D] border-b-2 border-[#1F497D] pb-1 mb-2 uppercase tracking-wide">
    {children}
  </h2>
);

// ── Preview component ────────────────────────────────────────────────────────

export default function OhioPreview({ resumeData }: { resumeData: ResumeData }) {
  const sorted = sortEdu(resumeData.education || []);

  return (
    <div id="resume-preview" className="bg-white font-[Calibri,sans-serif] text-[11pt] leading-[1.3] p-6 text-gray-900">

      {/* ── Header ── */}
      <div className="text-center mb-4">
        <h1 className="text-[18pt] font-bold text-[#1F497D]">{resumeData.name || 'Full Name'}</h1>
        <div className="flex justify-between mt-1 text-[11pt]">
          <span><span className="font-bold text-[#1F497D]">Title/Role:</span> {resumeData.title}</span>
          {resumeData.requisitionNumber && (
            <span><span className="font-bold text-[#1F497D]">Req#:</span> {resumeData.requisitionNumber}</span>
          )}
        </div>
      </div>

      {/* ── Education ── */}
      <section className="mb-4">
        <SectionHead>Education</SectionHead>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[9pt] text-center">
            <thead>
              <tr className="bg-[#D9D9D9]">
                <th className="border border-gray-400 px-2 py-1 text-left text-[8.5pt] font-bold leading-tight">Degree<br/><span className="font-normal">(AA/AS, BA/BS…)</span></th>
                <th className="border border-gray-400 px-2 py-1 font-bold">Area of Study</th>
                <th className="border border-gray-400 px-2 py-1 font-bold">School / University</th>
                <th className="border border-gray-400 px-2 py-1 font-bold">Location</th>
                <th className="border border-gray-400 px-2 py-1 font-bold leading-tight">Awarded?<br/><span className="font-normal">(Yes/No)</span></th>
                <th className="border border-gray-400 px-2 py-1 font-bold leading-tight">Date<br/><span className="font-normal">(MM/YY)</span></th>
              </tr>
            </thead>
            <tbody>
              {sorted.length > 0 ? sorted.map((edu, i) => (
                <tr key={i} className="even:bg-gray-50">
                  <td className="border border-gray-300 px-2 py-1 text-left">{edu.degree || '-'}</td>
                  <td className="border border-gray-300 px-2 py-1">{edu.areaOfStudy || '-'}</td>
                  <td className="border border-gray-300 px-2 py-1">{edu.school || '-'}</td>
                  <td className="border border-gray-300 px-2 py-1">{fmtEdLoc(edu.location) || '-'}</td>
                  <td className="border border-gray-300 px-2 py-1">{edu.wasAwarded ? 'Yes' : 'No'}</td>
                  <td className="border border-gray-300 px-2 py-1">{edu.date || '-'}</td>
                </tr>
              )) : (
                <tr><td colSpan={6} className="border border-gray-300 px-2 py-1 text-gray-400">—</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Certifications ── */}
      {resumeData.certifications?.length > 0 && (
        <section className="mb-4">
          <SectionHead>Certifications and Certificates</SectionHead>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[9pt] text-center">
              <thead>
                <tr className="bg-[#D9D9D9]">
                  <th className="border border-gray-400 px-2 py-1 font-bold">Certification</th>
                  <th className="border border-gray-400 px-2 py-1 font-bold">Issued By</th>
                  <th className="border border-gray-400 px-2 py-1 font-bold leading-tight">Date Obtained<br/><span className="font-normal">(MM/YY)</span></th>
                  <th className="border border-gray-400 px-2 py-1 font-bold leading-tight">Cert #<br/><span className="font-normal">(If Applicable)</span></th>
                  <th className="border border-gray-400 px-2 py-1 font-bold leading-tight">Expiration<br/><span className="font-normal">(If Applicable)</span></th>
                </tr>
              </thead>
              <tbody>
                {resumeData.certifications.map((c, i) => (
                  <tr key={i} className="even:bg-gray-50">
                    <td className="border border-gray-300 px-2 py-1 text-left">{c.name || '-'}</td>
                    <td className="border border-gray-300 px-2 py-1">{c.issuedBy || '-'}</td>
                    <td className="border border-gray-300 px-2 py-1">{c.dateObtained || '-'}</td>
                    <td className="border border-gray-300 px-2 py-1">{c.certificationNumber || '-'}</td>
                    <td className="border border-gray-300 px-2 py-1">{c.expirationDate || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Employment History ── */}
      {resumeData.employmentHistory?.length > 0 && (
        <section className="mb-4">
          <SectionHead>Employment History</SectionHead>
          {resumeData.employmentHistory.map((job, ji) => {
            const loc    = fmtLoc(job.location || '');
            const dept   = (job.department || job.subRole || '').trim();
            const period = normalizeMonthAbbr(job.workPeriod || '');
            return (
              <div key={ji} className="mb-4">
                <div className="flex justify-between items-baseline">
                  <span className="font-bold text-[#1F497D] text-[12pt]">{job.companyName || 'Company'}</span>
                  <span className="font-bold text-[#1F497D] text-[11pt]">{period}</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="font-bold text-[#1F497D]">{job.roleName || 'Role'}</span>
                  {loc && <span className="font-bold text-[#1F497D]">{loc}</span>}
                </div>
                {dept && <p className="text-[10pt] text-gray-700">{dept}</p>}

                {job.responsibilities?.filter(r => r.trim()).length > 0 && (
                  <ul className="list-disc ml-5 mt-1 space-y-0.5">
                    {job.responsibilities.filter(r => r.trim()).map((r, ri) => (
                      <li key={ri} className="text-[10pt]">{stripBullet(r)}</li>
                    ))}
                  </ul>
                )}

                {job.projects?.length > 0 && job.projects.map((proj, pi) => {
                  const title = fmtProjTitle(proj as Record<string, unknown>, pi, job.projects.length);
                  return (
                    <div key={pi} className="mt-2 pl-3 border-l-2 border-[#1F497D]/20">
                      <p className="font-bold text-[10.5pt]">{title}</p>
                      {proj.keyTechnologies && (
                        <p className="text-[9.5pt] text-gray-600"><span className="font-bold">Key Technologies: </span>{proj.keyTechnologies}</p>
                      )}
                      {proj.projectResponsibilities?.length > 0 && (
                        <ul className="list-disc ml-5 mt-1 space-y-0.5">
                          {proj.projectResponsibilities.filter(r => r.trim()).map((r, ri) => (
                            <li key={ri} className="text-[10pt]">{stripBullet(r)}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}

                {job.subsections?.map((sub, si) => (
                  <div key={si} className="mt-2">
                    {sub.title && <p className="font-bold text-[10pt]">{sub.title}:</p>}
                    {sub.content?.length > 0 && (
                      <ul className="list-disc ml-5 space-y-0.5">
                        {sub.content.filter(i => i.trim()).map((item, ii) => (
                          <li key={ii} className="text-[10pt]">{stripBullet(item)}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}

                {job.keyTechnologies && (
                  <p className="mt-1 text-[10pt]">
                    <span className="font-bold">Key Technologies/Skills: </span>{job.keyTechnologies}
                  </p>
                )}
              </div>
            );
          })}
        </section>
      )}

      {/* ── Professional Summary ── */}
      {(resumeData.professionalSummary?.length > 0 || resumeData.summarySections?.length > 0) && (
        <section className="mb-4">
          <SectionHead>Professional Summary</SectionHead>
          {resumeData.professionalSummary?.length > 0 && (() => {
            const items = resumeData.professionalSummary.flatMap(p => splitBulletItems(p));
            return items.length > 1 ? (
              <ul className="list-disc ml-5 space-y-0.5 mb-2">
                {items.map((item, i) => <li key={i} className="text-[10pt] text-justify">{item}</li>)}
              </ul>
            ) : (
              <p className="text-[10pt] text-justify mb-2">{items[0]}</p>
            );
          })()}
          {(resumeData.summarySections || resumeData.subsections || []).map((sec, si) => (
            <div key={si} className="mt-2">
              {sec.title && <p className="font-bold text-[10.5pt]">{sec.title}</p>}
              {sec.content?.map((item, ii) => <p key={ii} className="text-[10pt] text-justify">{item}</p>)}
            </div>
          ))}
        </section>
      )}

      {/* ── Technical Skills ── */}
      {(Object.keys(resumeData.technicalSkills || {}).length > 0 || resumeData.skillCategories?.length > 0) && (
        <section className="mb-2">
          <SectionHead>Technical Skills</SectionHead>
          {Object.entries(resumeData.technicalSkills || {}).map(([cat, skills]) => (
            <p key={cat} className="text-[10pt] mb-0.5">
              <span className="font-bold">{cat}: </span>
              {Array.isArray(skills) ? skills.join(', ') : skills}
            </p>
          ))}
          {resumeData.skillCategories?.map((cat, ci) => (
            <div key={ci} className="mb-1">
              <p className="text-[10pt]">
                <span className="font-bold">{cat.categoryName}: </span>
                {Array.isArray(cat.skills) ? cat.skills.join(', ') : ''}
              </p>
              {cat.subCategories?.map((sub, si) => (
                <p key={si} className="text-[10pt] ml-4">
                  <span className="font-bold">{sub.name}: </span>
                  {Array.isArray(sub.skills) ? sub.skills.join(', ') : ''}
                </p>
              ))}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
