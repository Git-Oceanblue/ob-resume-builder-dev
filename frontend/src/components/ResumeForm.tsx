'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Trash2, ChevronRight, GraduationCap, Award, Briefcase, FileText, Code, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import type { ResumeData } from '@/types/resume';

// ── Degree sorting ─────────────────────────────────────────────────────────────

function normDeg(d = '') { return d.toUpperCase().replace(/\./g, '').replace(/\s+/g, ' ').trim(); }
function degRank(d = '') {
  const n = normDeg(d); const c = n.replace(/\s+/g, '');
  if (/\b(AA|AS|ASSOCIATE)\b/.test(n)) return 1;
  if (/\b(BA|BS|BSC|BACHELOR|BE)\b/.test(n) || /BTECH/.test(c)) return 2;
  if (/\b(MA|MS|MBA|MASTER)\b/.test(n) || /MTECH/.test(c)) return 3;
  if (/\b(PHD|DOCTOR|DOCTORATE|DOCTORAL|DOCTOROL)\b/.test(n)) return 4;
  return 5;
}
function sortEdu<T extends { degree?: string }>(arr: T[]): T[] {
  return arr.map((e, i) => ({ e, i, r: degRank(e.degree) })).sort((a, b) => a.r - b.r || a.i - b.i).map(x => x.e);
}

// ── Small helpers ──────────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title, count }: { icon: React.ElementType; title: string; count?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="w-4 h-4 text-[#0b91c9] flex-shrink-0" />
      <span className="font-semibold text-slate-800 text-sm">{title}</span>
      {count != null && count > 0 && (
        <span className="ml-auto text-[11px] font-bold bg-[#0b91c9]/10 text-[#0b6cb5] border border-[#0b91c9]/20 px-2 py-0.5 rounded-full">
          {count}
        </span>
      )}
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1 ${className || ''}`}>
      <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{label}</Label>
      {children}
    </div>
  );
}

function AddInline({ placeholder, onAdd }: { placeholder: string; onAdd: (name: string) => void }) {
  const [open, setOpen]   = useState(false);
  const [value, setValue] = useState('');
  if (!open)
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)} className="text-[#0b91c9] hover:text-ocean-dark text-xs h-7">
        <Plus className="w-3.5 h-3.5 mr-1" />{placeholder}
      </Button>
    );
  return (
    <div className="flex gap-2 mt-1">
      <Input
        autoFocus value={value} onChange={e => setValue(e.target.value)} placeholder="Enter name…"
        className="h-8 text-sm"
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); if (value.trim()) { onAdd(value.trim()); setValue(''); setOpen(false); } }
          if (e.key === 'Escape') { setValue(''); setOpen(false); }
        }}
      />
      <Button type="button" size="sm" className="h-8 px-3 bg-ocean-dark text-white hover:bg-[#013a63]" onClick={() => { if (value.trim()) { onAdd(value.trim()); setValue(''); setOpen(false); } }}>Add</Button>
      <Button type="button" size="sm" variant="ghost" className="h-8 px-2" onClick={() => { setValue(''); setOpen(false); }}>✕</Button>
    </div>
  );
}

function DeleteBtn({ onClick }: { onClick: () => void }) {
  return (
    <Button type="button" variant="ghost" size="icon" onClick={onClick}
      className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50 flex-shrink-0">
      <Trash2 className="w-3.5 h-3.5" />
    </Button>
  );
}

function CardWrap({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-slate-50 rounded-xl border border-slate-200 p-4 ${className}`}>{children}</div>;
}

// ── Main ───────────────────────────────────────────────────────────────────────

interface Props { initialData: ResumeData; onSubmit: (d: ResumeData) => void; onChange: (d: ResumeData) => void; onBack?: () => void; }

export default function ResumeForm({ initialData, onSubmit, onChange, onBack }: Props) {
  const [form, setForm] = useState<ResumeData>(initialData || {} as ResumeData);

  useEffect(() => {
    if (!initialData) return;
    const u = { ...initialData };
    if (initialData.subsections && (!initialData.summarySections?.length))
      u.summarySections = [...initialData.subsections];
    u.skillCategories = initialData.skillCategories
      ? initialData.skillCategories.map(c => ({ ...c, subCategories: Array.isArray(c.subCategories) ? c.subCategories : [] }))
      : [];
    u.education = sortEdu(u.education || []);
    setForm(u);
  }, [initialData]);

  useEffect(() => { if (form && Object.keys(form).length > 0) onChange(form); }, [form]); // eslint-disable-line

  const set = (p: Partial<ResumeData>) => setForm(f => ({ ...f, ...p }));

  // Education
  const eduChange = (i: number, f: string, v: unknown) => {
    const a = [...(form.education || [])];
    a[i] = { ...a[i], [f]: f === 'wasAwarded' ? v === 'true' : v };
    set({ education: sortEdu(a) });
  };
  const addEdu = () => set({ education: sortEdu([...(form.education || []), { degree: '', areaOfStudy: '', school: '', location: '', date: '', wasAwarded: true }]) });
  const remEdu = (i: number) => { const a = [...(form.education || [])]; a.splice(i, 1); set({ education: sortEdu(a) }); };

  // Certifications
  const certChange = (i: number, f: string, v: string) => { const a = [...(form.certifications || [])]; a[i] = { ...a[i], [f]: v }; set({ certifications: a }); };
  const addCert = () => set({ certifications: [...(form.certifications || []), { name: '', issuedBy: '', dateObtained: '', certificationNumber: '', expirationDate: '' }] });
  const remCert = (i: number) => { const a = [...(form.certifications || [])]; a.splice(i, 1); set({ certifications: a }); };

  // Employment
  const empChange = (i: number, f: string, v: string) => { const a = [...(form.employmentHistory || [])]; a[i] = { ...a[i], [f]: v }; set({ employmentHistory: a }); };
  const addEmp = () => set({ employmentHistory: [...(form.employmentHistory || []), { companyName: '', roleName: '', workPeriod: '', location: '', department: '', subRole: '', description: '', responsibilities: [''], projects: [], subsections: [], keyTechnologies: '' }] });
  const remEmp = (i: number) => { const a = [...(form.employmentHistory || [])]; a.splice(i, 1); set({ employmentHistory: a }); };

  const respChange = (ei: number, ri: number, v: string) => { const a = [...(form.employmentHistory || [])]; a[ei].responsibilities[ri] = v; set({ employmentHistory: a }); };
  const addResp  = (ei: number) => { const a = [...(form.employmentHistory || [])]; a[ei] = { ...a[ei], responsibilities: [...a[ei].responsibilities, ''] }; set({ employmentHistory: a }); };
  const remResp  = (ei: number, ri: number) => { const a = [...(form.employmentHistory || [])]; a[ei].responsibilities.splice(ri, 1); set({ employmentHistory: a }); };

  const projChange     = (ei: number, pi: number, f: string, v: string) => { const a = [...(form.employmentHistory || [])]; if (!a[ei].projects) a[ei].projects = []; a[ei].projects[pi] = { ...a[ei].projects[pi], [f]: v }; set({ employmentHistory: a }); };
  const addProj        = (ei: number) => { const a = [...(form.employmentHistory || [])]; if (!a[ei].projects) a[ei].projects = []; a[ei].projects.push({ projectName: '', projectLocation: '', projectResponsibilities: [''], keyTechnologies: '', period: '' }); set({ employmentHistory: a }); };
  const remProj        = (ei: number, pi: number) => { const a = [...(form.employmentHistory || [])]; a[ei].projects.splice(pi, 1); set({ employmentHistory: a }); };
  const projRespChange = (ei: number, pi: number, ri: number, v: string) => { const a = [...(form.employmentHistory || [])]; a[ei].projects[pi].projectResponsibilities[ri] = v; set({ employmentHistory: a }); };
  const addProjResp    = (ei: number, pi: number) => { const a = [...(form.employmentHistory || [])]; a[ei].projects[pi].projectResponsibilities.push(''); set({ employmentHistory: a }); };
  const remProjResp    = (ei: number, pi: number, ri: number) => { const a = [...(form.employmentHistory || [])]; a[ei].projects[pi].projectResponsibilities.splice(ri, 1); set({ employmentHistory: a }); };

  const subChange    = (ei: number, si: number, f: string, v: string) => { const a = [...(form.employmentHistory || [])]; if (!a[ei].subsections) a[ei].subsections = []; a[ei].subsections[si] = { ...a[ei].subsections[si], [f]: v }; set({ employmentHistory: a }); };
  const addSub       = (ei: number) => { const a = [...(form.employmentHistory || [])]; if (!a[ei].subsections) a[ei].subsections = []; a[ei].subsections.push({ title: '', content: [] }); set({ employmentHistory: a }); };
  const remSub       = (ei: number, si: number) => { const a = [...(form.employmentHistory || [])]; a[ei].subsections.splice(si, 1); set({ employmentHistory: a }); };
  const subItemChange = (ei: number, si: number, ii: number, v: string) => { const a = [...(form.employmentHistory || [])]; a[ei].subsections[si].content[ii] = v; set({ employmentHistory: a }); };
  const addSubItem   = (ei: number, si: number) => { const a = [...(form.employmentHistory || [])]; a[ei].subsections[si].content.push(''); set({ employmentHistory: a }); };
  const remSubItem   = (ei: number, si: number, ii: number) => { const a = [...(form.employmentHistory || [])]; a[ei].subsections[si].content.splice(ii, 1); set({ employmentHistory: a }); };

  // Summary
  const sumChange       = (i: number, v: string) => { const a = [...(form.professionalSummary || [])]; a[i] = v; set({ professionalSummary: a }); };
  const addSum          = () => set({ professionalSummary: [...(form.professionalSummary || []), ''] });
  const remSum          = (i: number) => { const a = [...(form.professionalSummary || [])]; a.splice(i, 1); set({ professionalSummary: a }); };
  const sumSecChange     = (si: number, f: string, v: string) => { const a = [...(form.summarySections || [])]; a[si] = { ...a[si], [f]: v }; set({ summarySections: a }); };
  const addSumSec        = (title = '') => set({ summarySections: [...(form.summarySections || []), { title, content: title ? [''] : [] }] });
  const remSumSec        = (si: number) => { const a = [...(form.summarySections || [])]; a.splice(si, 1); set({ summarySections: a }); };
  const sumSecItemChange = (si: number, ii: number, v: string) => { const a = [...(form.summarySections || [])]; a[si].content[ii] = v; set({ summarySections: a }); };
  const addSumSecItem    = (si: number) => { const a = [...(form.summarySections || [])]; a[si].content.push(''); set({ summarySections: a }); };
  const remSumSecItem    = (si: number, ii: number) => { const a = [...(form.summarySections || [])]; a[si].content.splice(ii, 1); set({ summarySections: a }); };

  // Skills
  const skillCatChange    = (cat: string, v: string) => set({ technicalSkills: { ...(form.technicalSkills || {}), [cat]: v.split(',').map(s => s.trim()) } });
  const remSkillCat       = (cat: string) => { const { [cat]: _, ...rest } = form.technicalSkills || {}; set({ technicalSkills: rest }); };
  const addSkillCat       = (name: string) => { if (!form.technicalSkills?.[name]) set({ technicalSkills: { ...(form.technicalSkills || {}), [name]: [] } }); };
  const nestedCatChange   = (ci: number, v: string) => { const a = [...(form.skillCategories || [])]; a[ci].skills = v.split(',').map(s => s.trim()); set({ skillCategories: a }); };
  const nestedNameChange  = (ci: number, v: string) => { const a = [...(form.skillCategories || [])]; a[ci].categoryName = v; set({ skillCategories: a }); };
  const addNestedCat      = (name: string) => set({ skillCategories: [...(form.skillCategories || []), { categoryName: name, skills: [], subCategories: [] }] });
  const remNestedCat      = (ci: number) => { const a = [...(form.skillCategories || [])]; a.splice(ci, 1); set({ skillCategories: a }); };
  const subCatChange      = (ci: number, si: number, f: string, v: string) => { const a = [...(form.skillCategories || [])]; if (!a[ci].subCategories) a[ci].subCategories = []; a[ci].subCategories[si] = { ...a[ci].subCategories[si], [f]: f === 'skills' ? v.split(',').map(s => s.trim()) as never : v as never }; set({ skillCategories: a }); };
  const addSubCat         = (ci: number, name: string) => { const a = [...(form.skillCategories || [])]; if (!a[ci].subCategories) a[ci].subCategories = []; a[ci].subCategories.push({ name, skills: [] }); set({ skillCategories: a }); };
  const remSubCat         = (ci: number, si: number) => { const a = [...(form.skillCategories || [])]; a[ci].subCategories.splice(si, 1); set({ skillCategories: a }); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ ...form, education: sortEdu(form.education || []) });
  };

  const inputCls = "h-9 text-sm border-slate-200 focus:border-[#0b91c9] focus:ring-1 focus:ring-[#0b91c9]/30 rounded-lg";
  const textCls  = "text-sm border-slate-200 focus:border-[#0b91c9] focus:ring-1 focus:ring-[#0b91c9]/30 rounded-lg min-h-[72px]";
  const addBtnCls = "text-[#0b91c9] hover:text-ocean-dark text-xs h-7 font-medium";

  return (
    <div className="flex flex-col h-full">

      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2.5">
          {onBack && (
            <button type="button" onClick={onBack}
              className="text-xs text-slate-400 hover:text-ocean-dark font-medium transition-colors flex items-center gap-1">
              ← Back
            </button>
          )}
          <span className="text-slate-300 text-sm">|</span>
          <h2 className="text-sm font-bold text-ocean-dark">Edit Resume</h2>
        </div>
        <Button type="button" onClick={handleSubmit} size="sm"
          className="h-8 px-4 bg-ocean-dark hover:bg-[#013a63] text-white text-xs font-semibold rounded-lg">
          <ChevronRight className="mr-1 h-3.5 w-3.5" /> Save Changes
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="p-4 space-y-2 pb-8">
        <Accordion type="multiple" defaultValue={['personal','education','employment','summary','skills']} className="space-y-2">

          {/* Personal Info */}
          <AccordionItem value="personal" className="border border-slate-200 rounded-xl px-4 bg-white shadow-sm">
            <AccordionTrigger className="py-3"><SectionHeader icon={User} title="Personal Information" /></AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-2">
                <Field label="Full Name"><Input value={form.name || ''} onChange={e => set({ name: e.target.value })} className={inputCls} /></Field>
                <Field label="Title / Role"><Input value={form.title || ''} onChange={e => set({ title: e.target.value })} className={inputCls} /></Field>
                <Field label="Requisition Number"><Input value={form.requisitionNumber || ''} onChange={e => set({ requisitionNumber: e.target.value })} placeholder="Optional" className={inputCls} /></Field>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Education */}
          <AccordionItem value="education" className="border border-slate-200 rounded-xl px-4 bg-white shadow-sm">
            <AccordionTrigger className="py-3"><SectionHeader icon={GraduationCap} title="Education" count={form.education?.length} /></AccordionTrigger>
            <AccordionContent>
              <div className="space-y-3 pb-2">
                {(form.education || []).map((edu, i) => (
                  <CardWrap key={i}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Education #{i+1}</span>
                      <DeleteBtn onClick={() => remEdu(i)} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Field label="Degree"><Input value={edu.degree || ''} onChange={e => eduChange(i, 'degree', e.target.value)} className={inputCls} /></Field>
                      <Field label="Area of Study"><Input value={edu.areaOfStudy || ''} onChange={e => eduChange(i, 'areaOfStudy', e.target.value)} className={inputCls} /></Field>
                      <Field label="School"><Input value={edu.school || ''} onChange={e => eduChange(i, 'school', e.target.value)} className={inputCls} /></Field>
                      <Field label="Location"><Input value={edu.location || ''} onChange={e => eduChange(i, 'location', e.target.value)} className={inputCls} /></Field>
                      <Field label="Date"><Input value={edu.date || ''} onChange={e => eduChange(i, 'date', e.target.value)} className={inputCls} /></Field>
                      <Field label="Degree Awarded">
                        <select value={edu.wasAwarded ? 'true' : 'false'} onChange={e => eduChange(i, 'wasAwarded', e.target.value)}
                          className="flex h-9 w-full rounded-lg border border-slate-200 bg-white px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-[#0b91c9]/30 focus:border-[#0b91c9]">
                          <option value="true">Yes</option>
                          <option value="false">No</option>
                        </select>
                      </Field>
                    </div>
                  </CardWrap>
                ))}
                {!form.education?.length && <p className="text-xs text-slate-400 text-center py-2">No education added yet.</p>}
                <Button type="button" variant="outline" size="sm" onClick={addEdu} className="w-full border-dashed text-xs">
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add Education
                </Button>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Certifications */}
          <AccordionItem value="certifications" className="border border-slate-200 rounded-xl px-4 bg-white shadow-sm">
            <AccordionTrigger className="py-3"><SectionHeader icon={Award} title="Certifications" count={form.certifications?.length} /></AccordionTrigger>
            <AccordionContent>
              <div className="space-y-3 pb-2">
                {(form.certifications || []).map((cert, i) => (
                  <CardWrap key={i}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Cert #{i+1}</span>
                      <DeleteBtn onClick={() => remCert(i)} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Field label="Certification Name"><Input value={cert.name || ''} onChange={e => certChange(i, 'name', e.target.value)} className={inputCls} /></Field>
                      <Field label="Issued By"><Input value={cert.issuedBy || ''} onChange={e => certChange(i, 'issuedBy', e.target.value)} className={inputCls} /></Field>
                      <Field label="Date Obtained"><Input value={cert.dateObtained || ''} onChange={e => certChange(i, 'dateObtained', e.target.value)} className={inputCls} /></Field>
                      <Field label="Cert Number"><Input value={cert.certificationNumber || ''} onChange={e => certChange(i, 'certificationNumber', e.target.value)} className={inputCls} /></Field>
                      <Field label="Expiration Date"><Input value={cert.expirationDate || ''} onChange={e => certChange(i, 'expirationDate', e.target.value)} className={inputCls} /></Field>
                    </div>
                  </CardWrap>
                ))}
                {!form.certifications?.length && <p className="text-xs text-slate-400 text-center py-2">No certifications added yet.</p>}
                <Button type="button" variant="outline" size="sm" onClick={addCert} className="w-full border-dashed text-xs">
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add Certification
                </Button>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Employment */}
          <AccordionItem value="employment" className="border border-slate-200 rounded-xl px-4 bg-white shadow-sm">
            <AccordionTrigger className="py-3"><SectionHeader icon={Briefcase} title="Employment History" count={form.employmentHistory?.length} /></AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4 pb-2">
                {(form.employmentHistory || []).map((job, ei) => (
                  <CardWrap key={ei}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{job.companyName || `Job #${ei+1}`}</span>
                      <DeleteBtn onClick={() => remEmp(ei)} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                      <Field label="Company"><Input value={job.companyName || ''} onChange={e => empChange(ei, 'companyName', e.target.value)} className={inputCls} /></Field>
                      <Field label="Role"><Input value={job.roleName || ''} onChange={e => empChange(ei, 'roleName', e.target.value)} className={inputCls} /></Field>
                      <Field label="Period"><Input value={job.workPeriod || ''} onChange={e => empChange(ei, 'workPeriod', e.target.value)} className={inputCls} /></Field>
                      <Field label="Location"><Input value={job.location || ''} onChange={e => empChange(ei, 'location', e.target.value)} className={inputCls} /></Field>
                      <Field label="Key Technologies" className="sm:col-span-2">
                        <Input value={job.keyTechnologies || ''} onChange={e => empChange(ei, 'keyTechnologies', e.target.value)} placeholder="e.g., React, Node.js, AWS" className={inputCls} />
                      </Field>
                    </div>

                    {/* Projects */}
                    <div className="border-t border-slate-100 pt-3 mb-3">
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Projects</Label>
                        <Button type="button" variant="ghost" size="sm" onClick={() => addProj(ei)} className={addBtnCls}>
                          <Plus className="w-3 h-3 mr-0.5" /> Add
                        </Button>
                      </div>
                      {(job.projects || []).map((proj, pi) => (
                        <div key={pi} className="bg-white rounded-lg border border-slate-200 p-3 mb-2">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-xs font-medium text-slate-600">{proj.projectName || `Project ${pi+1}`}</span>
                            <DeleteBtn onClick={() => remProj(ei, pi)} />
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                            <Field label="Name"><Input value={proj.projectName || ''} onChange={e => projChange(ei, pi, 'projectName', e.target.value)} className={inputCls} /></Field>
                            <Field label="Location"><Input value={proj.projectLocation || ''} onChange={e => projChange(ei, pi, 'projectLocation', e.target.value)} className={inputCls} /></Field>
                            <Field label="Period"><Input value={proj.period || ''} onChange={e => projChange(ei, pi, 'period', e.target.value)} className={inputCls} /></Field>
                            <Field label="Technologies"><Input value={proj.keyTechnologies || ''} onChange={e => projChange(ei, pi, 'keyTechnologies', e.target.value)} className={inputCls} /></Field>
                          </div>
                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <Label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Responsibilities</Label>
                              <Button type="button" variant="ghost" size="sm" onClick={() => addProjResp(ei, pi)} className={addBtnCls}><Plus className="w-3 h-3" /></Button>
                            </div>
                            {(proj.projectResponsibilities || []).map((r, ri) => (
                              <div key={ri} className="flex gap-1.5 mb-1">
                                <Input value={r} onChange={e => projRespChange(ei, pi, ri, e.target.value)} className="h-8 text-xs flex-1" placeholder="Responsibility" />
                                <DeleteBtn onClick={() => remProjResp(ei, pi, ri)} />
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Responsibilities */}
                    <div className="border-t border-slate-100 pt-3 mb-3">
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">General Responsibilities</Label>
                        <Button type="button" variant="ghost" size="sm" onClick={() => addResp(ei)} className={addBtnCls}><Plus className="w-3 h-3 mr-0.5" /> Add</Button>
                      </div>
                      {(job.responsibilities || []).map((r, ri) => (
                        <div key={ri} className="flex gap-1.5 mb-1.5">
                          <Input value={r} onChange={e => respChange(ei, ri, e.target.value)} className="h-8 text-xs flex-1" placeholder="Responsibility…" />
                          <DeleteBtn onClick={() => remResp(ei, ri)} />
                        </div>
                      ))}
                    </div>

                    {/* Subsections */}
                    <div className="border-t border-slate-100 pt-3">
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Subsections</Label>
                        <Button type="button" variant="ghost" size="sm" onClick={() => addSub(ei)} className={addBtnCls}><Plus className="w-3 h-3 mr-0.5" /> Add</Button>
                      </div>
                      {(job.subsections || []).map((sub, si) => (
                        <div key={si} className="bg-white rounded-lg border border-slate-200 p-3 mb-2">
                          <div className="flex gap-2 mb-2">
                            <Input value={sub.title || ''} onChange={e => subChange(ei, si, 'title', e.target.value)} className="h-8 text-xs flex-1" placeholder="Subsection title" />
                            <DeleteBtn onClick={() => remSub(ei, si)} />
                          </div>
                          {(sub.content || []).map((item, ii) => (
                            <div key={ii} className="flex gap-1.5 mb-1">
                              <Input value={item} onChange={e => subItemChange(ei, si, ii, e.target.value)} className="h-7 text-xs flex-1" placeholder="Bullet point" />
                              <DeleteBtn onClick={() => remSubItem(ei, si, ii)} />
                            </div>
                          ))}
                          <Button type="button" variant="ghost" size="sm" onClick={() => addSubItem(ei, si)} className={`${addBtnCls} mt-1`}><Plus className="w-3 h-3 mr-0.5" /> Add point</Button>
                        </div>
                      ))}
                    </div>
                  </CardWrap>
                ))}
                {!form.employmentHistory?.length && <p className="text-xs text-slate-400 text-center py-2">No employment history added yet.</p>}
                <Button type="button" variant="outline" size="sm" onClick={addEmp} className="w-full border-dashed text-xs">
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add Employment
                </Button>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Professional Summary */}
          <AccordionItem value="summary" className="border border-slate-200 rounded-xl px-4 bg-white shadow-sm">
            <AccordionTrigger className="py-3"><SectionHeader icon={FileText} title="Professional Summary" count={form.professionalSummary?.length} /></AccordionTrigger>
            <AccordionContent>
              <div className="space-y-2 pb-2">
                {(form.professionalSummary || []).map((pt, i) => (
                  <div key={i} className="flex gap-1.5">
                    <Input value={pt} onChange={e => sumChange(i, e.target.value)} className={`${inputCls} flex-1`} placeholder="Summary bullet point" />
                    <DeleteBtn onClick={() => remSum(i)} />
                  </div>
                ))}
                {!form.professionalSummary?.length && <p className="text-xs text-slate-400 py-1">No summary points yet.</p>}
                <Button type="button" variant="outline" size="sm" onClick={addSum} className="border-dashed text-xs">
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add Point
                </Button>

                <div className="border-t border-slate-100 pt-3 mt-3">
                  <Label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2 block">Summary Subsections</Label>
                  {(form.summarySections || []).map((sec, si) => (
                    <CardWrap key={si} className="mb-2">
                      <div className="flex gap-2 mb-2">
                        <Input value={sec.title || ''} onChange={e => sumSecChange(si, 'title', e.target.value)} className="h-8 text-xs flex-1" placeholder="e.g., Key Technologies" />
                        <DeleteBtn onClick={() => remSumSec(si)} />
                      </div>
                      {(sec.content || []).map((item, ii) => (
                        <div key={ii} className="flex gap-1.5 mb-1">
                          <Input value={item} onChange={e => sumSecItemChange(si, ii, e.target.value)} className="h-7 text-xs flex-1" placeholder="Bullet point" />
                          <DeleteBtn onClick={() => remSumSecItem(si, ii)} />
                        </div>
                      ))}
                      <Button type="button" variant="ghost" size="sm" onClick={() => addSumSecItem(si)} className={`${addBtnCls} mt-1`}><Plus className="w-3 h-3 mr-0.5" /> Add point</Button>
                    </CardWrap>
                  ))}
                  <div className="flex flex-wrap gap-2 mt-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => addSumSec('Key Technologies')} className="text-emerald-600 hover:text-emerald-700 text-xs h-7"><Plus className="w-3 h-3 mr-0.5" /> Key Technologies</Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => addSumSec('Key Strengths')} className="text-purple-600 hover:text-purple-700 text-xs h-7"><Plus className="w-3 h-3 mr-0.5" /> Key Strengths</Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => addSumSec()} className={addBtnCls}><Plus className="w-3 h-3 mr-0.5" /> Custom</Button>
                  </div>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Technical Skills */}
          <AccordionItem value="skills" className="border border-slate-200 rounded-xl px-4 bg-white shadow-sm">
            <AccordionTrigger className="py-3"><SectionHeader icon={Code} title="Technical Skills" /></AccordionTrigger>
            <AccordionContent>
              <div className="space-y-3 pb-2">
                {Object.entries(form.technicalSkills || {}).map(([cat, skills]) => (
                  <div key={cat} className="flex gap-2 items-start">
                    <div className="flex-1">
                      <Label className="text-[11px] text-slate-500 mb-1 block font-semibold uppercase tracking-wide">{cat}</Label>
                      <Textarea value={(skills || []).join(', ')} onChange={e => skillCatChange(cat, e.target.value)} className={textCls} placeholder="Comma-separated skills" />
                    </div>
                    <Button type="button" variant="ghost" size="icon" onClick={() => remSkillCat(cat)} className="h-9 w-9 mt-5 text-red-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                ))}

                {(form.skillCategories || []).map((cat, ci) => (
                  <CardWrap key={ci}>
                    <div className="flex gap-2 items-start mb-3">
                      <div className="flex-1">
                        <Label className="text-[11px] text-slate-500 mb-1 block font-semibold uppercase tracking-wide">Category Name</Label>
                        <Input value={cat.categoryName || ''} onChange={e => nestedNameChange(ci, e.target.value)} className={inputCls} placeholder="e.g., Programming Languages" />
                      </div>
                      <Button type="button" variant="ghost" size="icon" onClick={() => remNestedCat(ci)} className="h-9 w-9 mt-5 text-red-400"><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                    <Field label="Main Skills">
                      <Textarea value={(cat.skills || []).join(', ')} onChange={e => nestedCatChange(ci, e.target.value)} className={textCls} placeholder="Comma-separated skills" />
                    </Field>
                    <div className="mt-3 border-t border-slate-100 pt-3">
                      <Label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2 block">Subcategories</Label>
                      {(cat.subCategories || []).map((sub, si) => (
                        <div key={si} className="bg-white rounded-lg border border-slate-200 p-3 mb-2">
                          <div className="flex gap-2 mb-2">
                            <Input value={sub.name || ''} onChange={e => subCatChange(ci, si, 'name', e.target.value)} className="h-8 text-xs flex-1" placeholder="Subcategory name" />
                            <DeleteBtn onClick={() => remSubCat(ci, si)} />
                          </div>
                          <Textarea value={(sub.skills || []).join(', ')} onChange={e => subCatChange(ci, si, 'skills', e.target.value)} className="text-xs min-h-[50px] border-slate-200 rounded-lg" placeholder="Comma-separated skills" />
                        </div>
                      ))}
                      <AddInline placeholder="Add Subcategory" onAdd={name => addSubCat(ci, name)} />
                    </div>
                  </CardWrap>
                ))}

                {!Object.keys(form.technicalSkills || {}).length && !form.skillCategories?.length && (
                  <p className="text-xs text-slate-400 text-center py-2">No skill categories added yet.</p>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  <AddInline placeholder="Add Simple Category" onAdd={addSkillCat} />
                  <AddInline placeholder="Add Nested Category" onAdd={addNestedCat} />
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

        </Accordion>
      </form>
    </div>
  );
}
