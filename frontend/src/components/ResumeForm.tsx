'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Trash2, ChevronRight, GraduationCap, Award, Briefcase, FileText, Code, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import type { ResumeData } from '@/types/resume';

// ── Helpers ─────────────────────────────────────────────────────────────────

function normalizeDegree(d = '') {
  return d.toUpperCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
}
function degreeRank(d = '') {
  const n = normalizeDegree(d);
  const c = n.replace(/\s+/g, '');
  if (/\b(AA|AS|ASSOCIATE)\b/.test(n)) return 1;
  if (/\b(BA|BS|BSC|BACHELOR|BE)\b/.test(n) || /BTECH/.test(c)) return 2;
  if (/\b(MA|MS|MBA|MASTER)\b/.test(n) || /MTECH/.test(c)) return 3;
  if (/\b(PHD|DOCTOR|DOCTORATE|DOCTORAL|DOCTOROL)\b/.test(n)) return 4;
  return 5;
}
function sortEducation<T extends { degree?: string }>(arr: T[]): T[] {
  return arr
    .map((e, i) => ({ e, i, r: degreeRank(e.degree) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map(x => x.e);
}

// ── Reusable small components ────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title, badge }: { icon: React.ElementType; title: string; badge?: number }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="w-4 h-4 text-[#0b91c9]" />
      <span className="font-semibold text-ocean-dark">{title}</span>
      {badge !== undefined && badge > 0 && (
        <Badge variant="ocean" className="ml-auto">{badge}</Badge>
      )}
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-gray-600">{label}</Label>
      {children}
    </div>
  );
}

function AddCategoryInline({
  placeholder,
  onAdd,
}: {
  placeholder: string;
  onAdd: (name: string) => void;
}) {
  const [open, setOpen]   = useState(false);
  const [value, setValue] = useState('');
  if (!open)
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)} className="text-[#0b91c9] hover:text-ocean-dark">
        <Plus className="w-3.5 h-3.5 mr-1" /> {placeholder}
      </Button>
    );
  return (
    <div className="flex gap-2 mt-1">
      <Input
        autoFocus
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (value.trim()) { onAdd(value.trim()); setValue(''); setOpen(false); } } if (e.key === 'Escape') { setValue(''); setOpen(false); } }}
        placeholder="Category name…"
        className="h-8 text-sm"
      />
      <Button type="button" size="sm" onClick={() => { if (value.trim()) { onAdd(value.trim()); setValue(''); setOpen(false); } }}>Add</Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => { setValue(''); setOpen(false); }}>✕</Button>
    </div>
  );
}

// ── Main Form ────────────────────────────────────────────────────────────────

interface ResumeFormProps {
  initialData: ResumeData;
  onSubmit: (data: ResumeData) => void;
  onChange: (data: ResumeData) => void;
  onBack?: () => void;
}

export default function ResumeForm({ initialData, onSubmit, onChange, onBack }: ResumeFormProps) {
  const [form, setForm] = useState<ResumeData>(initialData || {} as ResumeData);

  useEffect(() => {
    if (!initialData) return;
    const updated = { ...initialData };
    if (initialData.subsections && (!initialData.summarySections || !initialData.summarySections.length))
      updated.summarySections = [...initialData.subsections];
    if (initialData.skillCategories)
      updated.skillCategories = initialData.skillCategories.map(c => ({ ...c, subCategories: Array.isArray(c.subCategories) ? c.subCategories : [] }));
    else
      updated.skillCategories = [];
    updated.education = sortEducation(updated.education || []);
    setForm(updated);
  }, [initialData]);

  useEffect(() => {
    if (form && Object.keys(form).length > 0) onChange(form);
  }, [form]); // eslint-disable-line react-hooks/exhaustive-deps

  // Generic updater
  const set = (partial: Partial<ResumeData>) => setForm(f => ({ ...f, ...partial }));

  // ── Education ──────────────────────────────────────────────────────────────
  const eduChange = (i: number, field: string, v: unknown) => {
    const arr = [...(form.education || [])];
    arr[i] = { ...arr[i], [field]: field === 'wasAwarded' ? v === 'true' : v };
    set({ education: sortEducation(arr) });
  };
  const addEdu = () => set({ education: sortEducation([...(form.education || []), { degree: '', areaOfStudy: '', school: '', location: '', date: '', wasAwarded: true }]) });
  const remEdu = (i: number) => { const a = [...(form.education || [])]; a.splice(i, 1); set({ education: sortEducation(a) }); };

  // ── Certifications ─────────────────────────────────────────────────────────
  const certChange = (i: number, f: string, v: string) => { const a = [...(form.certifications || [])]; a[i] = { ...a[i], [f]: v }; set({ certifications: a }); };
  const addCert = () => set({ certifications: [...(form.certifications || []), { name: '', issuedBy: '', dateObtained: '', certificationNumber: '', expirationDate: '' }] });
  const remCert = (i: number) => { const a = [...(form.certifications || [])]; a.splice(i, 1); set({ certifications: a }); };

  // ── Employment ─────────────────────────────────────────────────────────────
  const empChange = (i: number, f: string, v: string) => { const a = [...(form.employmentHistory || [])]; a[i] = { ...a[i], [f]: v }; set({ employmentHistory: a }); };
  const addEmp = () => set({ employmentHistory: [...(form.employmentHistory || []), { companyName: '', roleName: '', workPeriod: '', location: '', department: '', subRole: '', description: '', responsibilities: [''], projects: [], subsections: [], keyTechnologies: '' }] });
  const remEmp = (i: number) => { const a = [...(form.employmentHistory || [])]; a.splice(i, 1); set({ employmentHistory: a }); };

  // Responsibilities
  const respChange = (ei: number, ri: number, v: string) => { const a = [...(form.employmentHistory || [])]; a[ei].responsibilities[ri] = v; set({ employmentHistory: a }); };
  const addResp = (ei: number) => { const a = [...(form.employmentHistory || [])]; a[ei] = { ...a[ei], responsibilities: [...a[ei].responsibilities, ''] }; set({ employmentHistory: a }); };
  const remResp = (ei: number, ri: number) => { const a = [...(form.employmentHistory || [])]; a[ei].responsibilities.splice(ri, 1); set({ employmentHistory: a }); };

  // Projects
  const projChange = (ei: number, pi: number, f: string, v: string) => { const a = [...(form.employmentHistory || [])]; if (!a[ei].projects) a[ei].projects = []; a[ei].projects[pi] = { ...a[ei].projects[pi], [f]: v }; set({ employmentHistory: a }); };
  const addProj = (ei: number) => { const a = [...(form.employmentHistory || [])]; if (!a[ei].projects) a[ei].projects = []; a[ei].projects.push({ projectName: '', projectLocation: '', projectResponsibilities: [''], keyTechnologies: '', period: '' }); set({ employmentHistory: a }); };
  const remProj = (ei: number, pi: number) => { const a = [...(form.employmentHistory || [])]; a[ei].projects.splice(pi, 1); set({ employmentHistory: a }); };
  const projRespChange = (ei: number, pi: number, ri: number, v: string) => { const a = [...(form.employmentHistory || [])]; a[ei].projects[pi].projectResponsibilities[ri] = v; set({ employmentHistory: a }); };
  const addProjResp = (ei: number, pi: number) => { const a = [...(form.employmentHistory || [])]; a[ei].projects[pi].projectResponsibilities.push(''); set({ employmentHistory: a }); };
  const remProjResp = (ei: number, pi: number, ri: number) => { const a = [...(form.employmentHistory || [])]; a[ei].projects[pi].projectResponsibilities.splice(ri, 1); set({ employmentHistory: a }); };

  // Subsections
  const subChange = (ei: number, si: number, f: string, v: string) => { const a = [...(form.employmentHistory || [])]; if (!a[ei].subsections) a[ei].subsections = []; a[ei].subsections[si] = { ...a[ei].subsections[si], [f]: v }; set({ employmentHistory: a }); };
  const addSub = (ei: number) => { const a = [...(form.employmentHistory || [])]; if (!a[ei].subsections) a[ei].subsections = []; a[ei].subsections.push({ title: '', content: [] }); set({ employmentHistory: a }); };
  const remSub = (ei: number, si: number) => { const a = [...(form.employmentHistory || [])]; a[ei].subsections.splice(si, 1); set({ employmentHistory: a }); };
  const subItemChange = (ei: number, si: number, ii: number, v: string) => { const a = [...(form.employmentHistory || [])]; a[ei].subsections[si].content[ii] = v; set({ employmentHistory: a }); };
  const addSubItem = (ei: number, si: number) => { const a = [...(form.employmentHistory || [])]; a[ei].subsections[si].content.push(''); set({ employmentHistory: a }); };
  const remSubItem = (ei: number, si: number, ii: number) => { const a = [...(form.employmentHistory || [])]; a[ei].subsections[si].content.splice(ii, 1); set({ employmentHistory: a }); };

  // ── Summary ────────────────────────────────────────────────────────────────
  const sumChange = (i: number, v: string) => { const a = [...(form.professionalSummary || [])]; a[i] = v; set({ professionalSummary: a }); };
  const addSum = () => set({ professionalSummary: [...(form.professionalSummary || []), ''] });
  const remSum = (i: number) => { const a = [...(form.professionalSummary || [])]; a.splice(i, 1); set({ professionalSummary: a }); };

  const sumSecChange = (si: number, f: string, v: string) => { const a = [...(form.summarySections || [])]; a[si] = { ...a[si], [f]: v }; set({ summarySections: a }); };
  const addSumSec = (title = '') => set({ summarySections: [...(form.summarySections || []), { title, content: title ? [''] : [] }] });
  const remSumSec = (si: number) => { const a = [...(form.summarySections || [])]; a.splice(si, 1); set({ summarySections: a }); };
  const sumSecItemChange = (si: number, ii: number, v: string) => { const a = [...(form.summarySections || [])]; a[si].content[ii] = v; set({ summarySections: a }); };
  const addSumSecItem = (si: number) => { const a = [...(form.summarySections || [])]; a[si].content.push(''); set({ summarySections: a }); };
  const remSumSecItem = (si: number, ii: number) => { const a = [...(form.summarySections || [])]; a[si].content.splice(ii, 1); set({ summarySections: a }); };

  // ── Skills ─────────────────────────────────────────────────────────────────
  const skillCatChange = (cat: string, v: string) => set({ technicalSkills: { ...(form.technicalSkills || {}), [cat]: v.split(',').map(s => s.trim()) } });
  const remSkillCat = (cat: string) => { const { [cat]: _, ...rest } = form.technicalSkills || {}; set({ technicalSkills: rest }); };
  const addSkillCat = (name: string) => { if (!form.technicalSkills?.[name]) set({ technicalSkills: { ...(form.technicalSkills || {}), [name]: [] } }); };

  const nestedCatChange = (ci: number, v: string) => { const a = [...(form.skillCategories || [])]; a[ci].skills = v.split(',').map(s => s.trim()); set({ skillCategories: a }); };
  const nestedCatNameChange = (ci: number, v: string) => { const a = [...(form.skillCategories || [])]; a[ci].categoryName = v; set({ skillCategories: a }); };
  const addNestedCat = (name: string) => set({ skillCategories: [...(form.skillCategories || []), { categoryName: name, skills: [], subCategories: [] }] });
  const remNestedCat = (ci: number) => { const a = [...(form.skillCategories || [])]; a.splice(ci, 1); set({ skillCategories: a }); };
  const subCatChange = (ci: number, si: number, f: string, v: string) => { const a = [...(form.skillCategories || [])]; if (!a[ci].subCategories) a[ci].subCategories = []; a[ci].subCategories[si] = { ...a[ci].subCategories[si], [f]: f === 'skills' ? v.split(',').map(s => s.trim()) as never : v as never }; set({ skillCategories: a }); };
  const addSubCat = (ci: number, name: string) => { const a = [...(form.skillCategories || [])]; if (!a[ci].subCategories) a[ci].subCategories = []; a[ci].subCategories.push({ name, skills: [] }); set({ skillCategories: a }); };
  const remSubCat = (ci: number, si: number) => { const a = [...(form.skillCategories || [])]; a[ci].subCategories.splice(si, 1); set({ skillCategories: a }); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ ...form, education: sortEducation(form.education || []) });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 shadow-sm px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {onBack && (
            <button type="button" onClick={onBack} className="text-xs text-gray-500 hover:text-ocean-dark font-medium transition-colors flex items-center gap-1">
              ← Upload
            </button>
          )}
          <span className="text-gray-200">|</span>
          <h2 className="text-sm font-bold text-ocean-dark">Edit Resume</h2>
        </div>
        <Button type="button" onClick={handleSubmit} size="sm" variant="ocean">
          <ChevronRight className="mr-1 h-3.5 w-3.5" /> Save Changes
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="p-5 space-y-2">
        <Accordion type="multiple" defaultValue={['personal','education','employment','summary','skills']} className="space-y-2">

          {/* ── Personal Info ── */}
          <AccordionItem value="personal" className="border border-gray-100 rounded-xl px-4 bg-gradient-to-r from-blue-50/50 to-indigo-50/50">
            <AccordionTrigger><SectionHeader icon={User} title="Personal Information" /></AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FieldRow label="Full Name"><Input value={form.name || ''} onChange={e => set({ name: e.target.value })} /></FieldRow>
                <FieldRow label="Title / Role"><Input value={form.title || ''} onChange={e => set({ title: e.target.value })} /></FieldRow>
                <FieldRow label="Requisition Number"><Input value={form.requisitionNumber || ''} onChange={e => set({ requisitionNumber: e.target.value })} placeholder="Optional" /></FieldRow>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* ── Education ── */}
          <AccordionItem value="education" className="border border-gray-100 rounded-xl px-4 bg-gradient-to-r from-emerald-50/50 to-teal-50/50">
            <AccordionTrigger><SectionHeader icon={GraduationCap} title="Education" badge={form.education?.length} /></AccordionTrigger>
            <AccordionContent>
              <div className="space-y-3">
                {(form.education || []).map((edu, i) => (
                  <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Education #{i + 1}</span>
                      <Button type="button" variant="ghost" size="icon" onClick={() => remEdu(i)} className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <FieldRow label="Degree"><Input value={edu.degree || ''} onChange={e => eduChange(i, 'degree', e.target.value)} /></FieldRow>
                      <FieldRow label="Area of Study"><Input value={edu.areaOfStudy || ''} onChange={e => eduChange(i, 'areaOfStudy', e.target.value)} /></FieldRow>
                      <FieldRow label="School/University"><Input value={edu.school || ''} onChange={e => eduChange(i, 'school', e.target.value)} /></FieldRow>
                      <FieldRow label="Location"><Input value={edu.location || ''} onChange={e => eduChange(i, 'location', e.target.value)} /></FieldRow>
                      <FieldRow label="Date"><Input value={edu.date || ''} onChange={e => eduChange(i, 'date', e.target.value)} /></FieldRow>
                      <FieldRow label="Degree Awarded?">
                        <select value={edu.wasAwarded ? 'true' : 'false'} onChange={e => eduChange(i, 'wasAwarded', e.target.value)} className="flex h-9 w-full rounded-lg border border-input bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b91c9]/40">
                          <option value="true">Yes</option>
                          <option value="false">No</option>
                        </select>
                      </FieldRow>
                    </div>
                  </div>
                ))}
                {!(form.education?.length) && <p className="text-sm text-gray-400 text-center py-2">No education added.</p>}
                <Button type="button" variant="outline" size="sm" onClick={addEdu} className="w-full border-dashed"><Plus className="w-3.5 h-3.5 mr-1.5" /> Add Education</Button>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* ── Certifications ── */}
          <AccordionItem value="certifications" className="border border-gray-100 rounded-xl px-4">
            <AccordionTrigger><SectionHeader icon={Award} title="Certifications" badge={form.certifications?.length} /></AccordionTrigger>
            <AccordionContent>
              <div className="space-y-3">
                {(form.certifications || []).map((cert, i) => (
                  <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Cert #{i + 1}</span>
                      <Button type="button" variant="ghost" size="icon" onClick={() => remCert(i)} className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <FieldRow label="Certification Name"><Input value={cert.name || ''} onChange={e => certChange(i, 'name', e.target.value)} /></FieldRow>
                      <FieldRow label="Issued By"><Input value={cert.issuedBy || ''} onChange={e => certChange(i, 'issuedBy', e.target.value)} /></FieldRow>
                      <FieldRow label="Date Obtained"><Input value={cert.dateObtained || ''} onChange={e => certChange(i, 'dateObtained', e.target.value)} /></FieldRow>
                      <FieldRow label="Cert Number"><Input value={cert.certificationNumber || ''} onChange={e => certChange(i, 'certificationNumber', e.target.value)} /></FieldRow>
                      <FieldRow label="Expiration Date"><Input value={cert.expirationDate || ''} onChange={e => certChange(i, 'expirationDate', e.target.value)} /></FieldRow>
                    </div>
                  </div>
                ))}
                {!(form.certifications?.length) && <p className="text-sm text-gray-400 text-center py-2">No certifications added.</p>}
                <Button type="button" variant="outline" size="sm" onClick={addCert} className="w-full border-dashed"><Plus className="w-3.5 h-3.5 mr-1.5" /> Add Certification</Button>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* ── Employment History ── */}
          <AccordionItem value="employment" className="border border-gray-100 rounded-xl px-4">
            <AccordionTrigger><SectionHeader icon={Briefcase} title="Employment History" badge={form.employmentHistory?.length} /></AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4">
                {(form.employmentHistory || []).map((job, ei) => (
                  <div key={ei} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{job.companyName || `Job #${ei + 1}`}</span>
                      <Button type="button" variant="ghost" size="icon" onClick={() => remEmp(ei)} className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                      <FieldRow label="Company Name"><Input value={job.companyName || ''} onChange={e => empChange(ei, 'companyName', e.target.value)} /></FieldRow>
                      <FieldRow label="Role Name"><Input value={job.roleName || ''} onChange={e => empChange(ei, 'roleName', e.target.value)} /></FieldRow>
                      <FieldRow label="Work Period"><Input value={job.workPeriod || ''} onChange={e => empChange(ei, 'workPeriod', e.target.value)} /></FieldRow>
                      <FieldRow label="Location"><Input value={job.location || ''} onChange={e => empChange(ei, 'location', e.target.value)} /></FieldRow>
                      <FieldRow label="Key Technologies" ><Input value={job.keyTechnologies || ''} onChange={e => empChange(ei, 'keyTechnologies', e.target.value)} placeholder="Technologies used" /></FieldRow>
                    </div>

                    {/* Projects */}
                    <div className="border-t border-gray-50 pt-3 mb-3">
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-xs font-semibold text-gray-600">Projects</Label>
                        <Button type="button" variant="ghost" size="sm" onClick={() => addProj(ei)} className="text-[#0b91c9] h-6 text-xs"><Plus className="w-3 h-3 mr-0.5" /> Add</Button>
                      </div>
                      {(job.projects || []).map((proj, pi) => (
                        <div key={pi} className="bg-gray-50 rounded-lg p-3 mb-2 border border-gray-100">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-xs font-medium text-gray-600">{proj.projectName || `Project ${pi + 1}`}</span>
                            <Button type="button" variant="ghost" size="icon" onClick={() => remProj(ei, pi)} className="h-6 w-6 text-red-400"><Trash2 className="w-3 h-3" /></Button>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                            <FieldRow label="Project Name"><Input value={proj.projectName || ''} onChange={e => projChange(ei, pi, 'projectName', e.target.value)} /></FieldRow>
                            <FieldRow label="Location"><Input value={proj.projectLocation || ''} onChange={e => projChange(ei, pi, 'projectLocation', e.target.value)} /></FieldRow>
                            <FieldRow label="Period"><Input value={proj.period || ''} onChange={e => projChange(ei, pi, 'period', e.target.value)} /></FieldRow>
                            <FieldRow label="Key Technologies"><Input value={proj.keyTechnologies || ''} onChange={e => projChange(ei, pi, 'keyTechnologies', e.target.value)} /></FieldRow>
                          </div>
                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <Label className="text-xs text-gray-600">Responsibilities</Label>
                              <Button type="button" variant="ghost" size="sm" onClick={() => addProjResp(ei, pi)} className="h-5 text-xs text-[#0b91c9]"><Plus className="w-3 h-3" /></Button>
                            </div>
                            {(proj.projectResponsibilities || []).map((r, ri) => (
                              <div key={ri} className="flex gap-1.5 mb-1">
                                <Input value={r} onChange={e => projRespChange(ei, pi, ri, e.target.value)} className="h-8 text-xs" placeholder="Responsibility" />
                                <Button type="button" variant="ghost" size="icon" onClick={() => remProjResp(ei, pi, ri)} className="h-8 w-8 flex-shrink-0 text-red-400"><Trash2 className="w-3 h-3" /></Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Responsibilities */}
                    <div className="border-t border-gray-50 pt-3 mb-3">
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-xs font-semibold text-gray-600">General Responsibilities</Label>
                        <Button type="button" variant="ghost" size="sm" onClick={() => addResp(ei)} className="text-[#0b91c9] h-6 text-xs"><Plus className="w-3 h-3 mr-0.5" /> Add</Button>
                      </div>
                      {(job.responsibilities || []).map((r, ri) => (
                        <div key={ri} className="flex gap-1.5 mb-1.5">
                          <Input value={r} onChange={e => respChange(ei, ri, e.target.value)} className="h-8 text-xs" placeholder="Responsibility" />
                          <Button type="button" variant="ghost" size="icon" onClick={() => remResp(ei, ri)} className="h-8 w-8 flex-shrink-0 text-red-400"><Trash2 className="w-3 h-3" /></Button>
                        </div>
                      ))}
                    </div>

                    {/* Subsections */}
                    <div className="border-t border-gray-50 pt-3">
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-xs font-semibold text-gray-600">Subsections</Label>
                        <Button type="button" variant="ghost" size="sm" onClick={() => addSub(ei)} className="text-[#0b91c9] h-6 text-xs"><Plus className="w-3 h-3 mr-0.5" /> Add</Button>
                      </div>
                      {(job.subsections || []).map((sub, si) => (
                        <div key={si} className="bg-gray-50 rounded-lg p-3 mb-2 border border-gray-100">
                          <div className="flex gap-2 mb-2">
                            <Input value={sub.title || ''} onChange={e => subChange(ei, si, 'title', e.target.value)} className="h-8 text-xs" placeholder="Subsection title" />
                            <Button type="button" variant="ghost" size="icon" onClick={() => remSub(ei, si)} className="h-8 w-8 flex-shrink-0 text-red-400"><Trash2 className="w-3 h-3" /></Button>
                          </div>
                          {(sub.content || []).map((item, ii) => (
                            <div key={ii} className="flex gap-1.5 mb-1">
                              <Input value={item} onChange={e => subItemChange(ei, si, ii, e.target.value)} className="h-7 text-xs" placeholder="Bullet point" />
                              <Button type="button" variant="ghost" size="icon" onClick={() => remSubItem(ei, si, ii)} className="h-7 w-7 flex-shrink-0 text-red-400"><Trash2 className="w-3 h-3" /></Button>
                            </div>
                          ))}
                          <Button type="button" variant="ghost" size="sm" onClick={() => addSubItem(ei, si)} className="h-6 text-xs text-[#0b91c9] mt-1"><Plus className="w-3 h-3 mr-0.5" /> Add point</Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {!(form.employmentHistory?.length) && <p className="text-sm text-gray-400 text-center py-2">No employment history added.</p>}
                <Button type="button" variant="outline" size="sm" onClick={addEmp} className="w-full border-dashed"><Plus className="w-3.5 h-3.5 mr-1.5" /> Add Employment</Button>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* ── Professional Summary ── */}
          <AccordionItem value="summary" className="border border-gray-100 rounded-xl px-4">
            <AccordionTrigger><SectionHeader icon={FileText} title="Professional Summary" badge={form.professionalSummary?.length} /></AccordionTrigger>
            <AccordionContent>
              <div className="space-y-2">
                {(form.professionalSummary || []).map((pt, i) => (
                  <div key={i} className="flex gap-1.5">
                    <Input value={pt} onChange={e => sumChange(i, e.target.value)} className="text-sm" placeholder="Summary bullet point" />
                    <Button type="button" variant="ghost" size="icon" onClick={() => remSum(i)} className="h-9 w-9 flex-shrink-0 text-red-400"><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                ))}
                {!(form.professionalSummary?.length) && <p className="text-sm text-gray-400 py-1">No summary points.</p>}
                <Button type="button" variant="outline" size="sm" onClick={addSum} className="border-dashed"><Plus className="w-3.5 h-3.5 mr-1" /> Add Point</Button>

                {/* Summary subsections */}
                <div className="border-t border-gray-100 pt-3 mt-3">
                  <Label className="text-xs font-semibold text-gray-600 mb-2 block">Summary Subsections</Label>
                  {(form.summarySections || []).map((sec, si) => (
                    <div key={si} className="bg-gray-50 rounded-lg p-3 mb-2 border border-gray-100">
                      <div className="flex gap-2 mb-2">
                        <Input value={sec.title || ''} onChange={e => sumSecChange(si, 'title', e.target.value)} className="h-8 text-xs" placeholder="e.g., Key Technologies" />
                        <Button type="button" variant="ghost" size="icon" onClick={() => remSumSec(si)} className="h-8 w-8 flex-shrink-0 text-red-400"><Trash2 className="w-3 h-3" /></Button>
                      </div>
                      {(sec.content || []).map((item, ii) => (
                        <div key={ii} className="flex gap-1.5 mb-1">
                          <Input value={item} onChange={e => sumSecItemChange(si, ii, e.target.value)} className="h-7 text-xs" placeholder="Bullet point" />
                          <Button type="button" variant="ghost" size="icon" onClick={() => remSumSecItem(si, ii)} className="h-7 w-7 flex-shrink-0 text-red-400"><Trash2 className="w-3 h-3" /></Button>
                        </div>
                      ))}
                      <Button type="button" variant="ghost" size="sm" onClick={() => addSumSecItem(si)} className="h-6 text-xs text-[#0b91c9] mt-1"><Plus className="w-3 h-3 mr-0.5" /> Add point</Button>
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-2 mt-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => addSumSec('Key Technologies')} className="text-emerald-600 hover:text-emerald-700 text-xs h-7"><Plus className="w-3 h-3 mr-0.5" /> Key Technologies</Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => addSumSec('Key Strengths')} className="text-purple-600 hover:text-purple-700 text-xs h-7"><Plus className="w-3 h-3 mr-0.5" /> Key Strengths</Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => addSumSec()} className="text-[#0b91c9] text-xs h-7"><Plus className="w-3 h-3 mr-0.5" /> Custom</Button>
                  </div>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* ── Technical Skills ── */}
          <AccordionItem value="skills" className="border border-gray-100 rounded-xl px-4">
            <AccordionTrigger><SectionHeader icon={Code} title="Technical Skills" /></AccordionTrigger>
            <AccordionContent>
              <div className="space-y-3">
                {/* Simple flat skills */}
                {Object.entries(form.technicalSkills || {}).map(([cat, skills]) => (
                  <div key={cat} className="flex gap-2 items-start">
                    <div className="flex-1">
                      <Label className="text-xs text-gray-500 mb-1 block">{cat}</Label>
                      <Textarea
                        value={(skills || []).join(', ')}
                        onChange={e => skillCatChange(cat, e.target.value)}
                        className="text-sm min-h-[60px]"
                        placeholder="Comma-separated skills"
                      />
                    </div>
                    <Button type="button" variant="ghost" size="icon" onClick={() => remSkillCat(cat)} className="h-9 w-9 mt-5 text-red-400"><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                ))}

                {/* Nested skill categories */}
                {(form.skillCategories || []).map((cat, ci) => (
                  <div key={ci} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                    <div className="flex gap-2 items-start mb-3">
                      <div className="flex-1">
                        <Label className="text-xs text-gray-600 mb-1 block">Category Name</Label>
                        <Input value={cat.categoryName || ''} onChange={e => nestedCatNameChange(ci, e.target.value)} className="text-sm" placeholder="e.g., Programming Languages" />
                      </div>
                      <Button type="button" variant="ghost" size="icon" onClick={() => remNestedCat(ci)} className="h-9 w-9 mt-5 text-red-400"><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                    <FieldRow label="Main Skills">
                      <Textarea value={(cat.skills || []).join(', ')} onChange={e => nestedCatChange(ci, e.target.value)} className="text-sm min-h-[60px]" placeholder="Comma-separated skills" />
                    </FieldRow>
                    {/* Subcategories */}
                    <div className="mt-3 border-t border-gray-50 pt-3">
                      <Label className="text-xs font-semibold text-gray-600 mb-2 block">Subcategories</Label>
                      {(cat.subCategories || []).map((sub, si) => (
                        <div key={si} className="bg-gray-50 rounded-lg p-3 mb-2 border border-gray-100">
                          <div className="flex gap-2 mb-2">
                            <Input value={sub.name || ''} onChange={e => subCatChange(ci, si, 'name', e.target.value)} className="h-8 text-xs" placeholder="Subcategory name" />
                            <Button type="button" variant="ghost" size="icon" onClick={() => remSubCat(ci, si)} className="h-8 w-8 flex-shrink-0 text-red-400"><Trash2 className="w-3 h-3" /></Button>
                          </div>
                          <Textarea value={(sub.skills || []).join(', ')} onChange={e => subCatChange(ci, si, 'skills', e.target.value)} className="text-xs min-h-[50px]" placeholder="Comma-separated skills" />
                        </div>
                      ))}
                      <AddCategoryInline placeholder="Add Subcategory" onAdd={name => addSubCat(ci, name)} />
                    </div>
                  </div>
                ))}

                {!Object.keys(form.technicalSkills || {}).length && !(form.skillCategories?.length) && (
                  <p className="text-sm text-gray-400 text-center py-2">No skill categories added.</p>
                )}

                <div className="flex flex-wrap gap-2">
                  <AddCategoryInline placeholder="Add Simple Category" onAdd={addSkillCat} />
                  <AddCategoryInline placeholder="Add Nested Category" onAdd={addNestedCat} />
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

        </Accordion>
      </form>
    </div>
  );
}
