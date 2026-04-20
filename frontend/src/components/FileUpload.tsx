'use client';

import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, FileText, AlertCircle, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ResumeData } from '@/types/resume';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');

function sanitizeResumeData(data: Record<string, unknown>): ResumeData {
  try {
    const sanitized: ResumeData = {
      name: (data.name as string) || '',
      title: (data.title as string) || '',
      requisitionNumber: (data.requisitionNumber as string) || '',
      professionalSummary: Array.isArray(data.professionalSummary)
        ? (data.professionalSummary as string[]).flatMap(item => {
            if (typeof item !== 'string') return [];
            if (item.includes('\u2022') || item.includes(' • '))
              return item.split(/\s*[•\u2022]\s*/).map(s => s.trim()).filter(Boolean);
            return [item];
          })
        : [],
      summarySections: Array.isArray(data.summarySections) ? (data.summarySections as never[]) : [],
      subsections: Array.isArray(data.subsections) ? (data.subsections as never[]) : [],
      employmentHistory: Array.isArray(data.employmentHistory) ? (data.employmentHistory as never[]) : [],
      education: Array.isArray(data.education) ? (data.education as never[]) : [],
      certifications: Array.isArray(data.certifications) ? (data.certifications as never[]) : [],
      technicalSkills: (data.technicalSkills && typeof data.technicalSkills === 'object')
        ? (data.technicalSkills as Record<string, string[]>) : {},
      skillCategories: Array.isArray(data.skillCategories) ? (data.skillCategories as never[]) : [],
      tokenStats: data.tokenStats as never,
    };

    sanitized.employmentHistory = (sanitized.employmentHistory as never[]).map((job: Record<string, unknown>) => ({
      companyName: (job.companyName as string) || '',
      roleName: (job.roleName as string) || '',
      workPeriod: (job.workPeriod as string) || '',
      location: (job.location as string) || '',
      department: (job.department as string) || '',
      subRole: (job.subRole as string) || '',
      description: (job.description as string) || '',
      responsibilities: Array.isArray(job.responsibilities) ? job.responsibilities as string[] : [],
      projects: Array.isArray(job.projects) ? (job.projects as Record<string, unknown>[]).map(p => ({
        projectName: (p.projectName as string) || '',
        projectLocation: (p.projectLocation as string) || '',
        projectResponsibilities: Array.isArray(p.projectResponsibilities) ? p.projectResponsibilities as string[] : [],
        keyTechnologies: (p.keyTechnologies as string) || '',
        period: (p.period as string) || '',
      })) : [],
      subsections: Array.isArray(job.subsections) ? (job.subsections as Record<string, unknown>[]).map(s => ({
        title: (s.title as string) || '',
        content: Array.isArray(s.content) ? s.content as string[] : [],
      })) : [],
      keyTechnologies: (job.keyTechnologies as string) || '',
    })) as never;

    const rawSummarySections = Array.isArray(data.summarySections) ? data.summarySections
      : (Array.isArray(data.subsections) ? data.subsections : []);
    sanitized.summarySections = (rawSummarySections as Record<string, unknown>[]).map(s => ({
      title: (s.title as string) || '',
      content: Array.isArray(s.content) ? s.content as string[] : [],
    }));
    sanitized.subsections = sanitized.summarySections;

    if (Array.isArray(data.skillCategories)) {
      sanitized.skillCategories = (data.skillCategories as Record<string, unknown>[]).map(c => ({
        categoryName: (c.categoryName as string) || '',
        skills: Array.isArray(c.skills) ? c.skills as string[] : [],
        subCategories: Array.isArray(c.subCategories) ? (c.subCategories as Record<string, unknown>[]).map(s => ({
          name: (s.name as string) || '',
          skills: Array.isArray(s.skills) ? s.skills as string[] : [],
        })) : [],
      }));
    }

    sanitized.education = (sanitized.education as never[]).map((e: Record<string, unknown>) => ({
      degree: (e.degree as string) || '',
      areaOfStudy: (e.areaOfStudy as string) || '',
      school: (e.school as string) || '',
      location: (e.location as string) || '',
      date: (e.date as string) || '',
      wasAwarded: e.wasAwarded !== undefined ? Boolean(e.wasAwarded) : true,
    })) as never;

    sanitized.certifications = (sanitized.certifications as never[]).map((c: Record<string, unknown>) => ({
      name: (c.name as string) || '',
      issuedBy: (c.issuedBy as string) || '',
      dateObtained: (c.dateObtained as string) || '',
      certificationNumber: (c.certificationNumber as string) || '',
      expirationDate: (c.expirationDate as string) || '',
    })) as never;

    return sanitized;
  } catch {
    return {
      name: '', title: '', requisitionNumber: '', professionalSummary: [],
      summarySections: [], subsections: [], employmentHistory: [], education: [],
      certifications: [], technicalSkills: {}, skillCategories: [],
    };
  }
}

interface Props {
  onResumeDataExtracted: (data: ResumeData) => void;
  setLoading: (v: boolean) => void;
  onAgentEvent: (event: Record<string, unknown>) => void;
}

export default function FileUpload({ onResumeDataExtracted, setLoading, onAgentEvent }: Props) {
  const [file, setFile]             = useState<File | null>(null);
  const [error, setError]           = useState('');
  const [isProcessing, setIsProcss] = useState(false);

  const onDrop = useCallback((accepted: File[]) => {
    const f = accepted[0];
    if (!f) return;
    const ext = '.' + f.name.split('.').pop()!.toLowerCase();
    if (ext === '.doc') { setError('DOC files are not supported. Please use DOCX, PDF, or TXT.'); return; }
    if (!['.pdf', '.docx', '.txt'].includes(ext)) { setError('Invalid file type. Please upload PDF, DOCX, or TXT.'); return; }
    if (f.size > 10 * 1024 * 1024) { setError('File size exceeds 10 MB.'); return; }
    setError('');
    setFile(f);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt'],
    },
  });

  const handleProcess = async () => {
    if (!file) { setError('Please select a file first.'); return; }
    setIsProcss(true);
    setLoading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${API_BASE}/api/stream-resume-processing`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error(`Server error: HTTP ${response.status}`);

      const reader  = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer    = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';

        for (const event of events) {
          if (!event.startsWith('data: ')) continue;
          try {
            const raw = event.slice(6);
            if (raw === '[DONE]') continue;
            const parsed = JSON.parse(raw) as Record<string, unknown>;
            onAgentEvent(parsed);
            if (parsed.type === 'final_data') {
              onResumeDataExtracted(sanitizeResumeData(parsed.data as Record<string, unknown>));
              return;
            }
            if (parsed.type === 'error') {
              setError((parsed.message as string) || 'Processing failed');
              return;
            }
          } catch { /* ignore parse errors */ }
        }
      }
    } catch (err) {
      setError(`Processing failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsProcss(false);
      setLoading(false);
    }
  };

  return (
    <div className="p-8">
      {/* Title */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-ocean-dark">Upload Resume</h2>
        <p className="text-sm text-slate-500 mt-1">PDF, DOCX, or TXT — up to 10 MB</p>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 mb-5 text-sm animate-fade-in">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError('')} className="ml-auto flex-shrink-0 hover:text-red-900">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={`relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-200 mb-5 select-none ${
          isDragActive
            ? 'border-[#0b91c9] bg-[#0b91c9]/5 shadow-inner'
            : file
              ? 'border-emerald-400 bg-emerald-50/50'
              : 'border-slate-200 hover:border-[#0b91c9] hover:bg-slate-50'
        }`}
      >
        <input {...getInputProps()} />
        <UploadCloud className={`mx-auto w-12 h-12 mb-3 transition-colors duration-200 ${
          isDragActive ? 'text-[#0b91c9]' : file ? 'text-emerald-500' : 'text-slate-300'
        }`} />
        <p className="font-semibold text-slate-700 text-sm mb-1">
          {isDragActive ? 'Drop to upload' : 'Drag & drop your resume'}
        </p>
        <p className="text-xs text-slate-400 mb-4">or click to browse</p>
        <div className="flex justify-center gap-2">
          {['PDF', 'DOCX', 'TXT'].map(t => (
            <span key={t} className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200">{t}</span>
          ))}
        </div>
      </div>

      {/* Selected file */}
      {file && (
        <div className="flex items-center gap-3 bg-ocean-dark/5 border border-ocean-dark/10 rounded-xl px-4 py-3 mb-5 animate-fade-in">
          <div className="w-9 h-9 rounded-lg bg-ocean-dark/10 flex items-center justify-center flex-shrink-0">
            <FileText className="w-4 h-4 text-ocean-dark" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-ocean-dark truncate">{file.name}</p>
            <p className="text-xs text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
          </div>
          <button onClick={() => setFile(null)} className="text-slate-400 hover:text-slate-600 flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Processing indicator */}
      {isProcessing && (
        <div className="flex flex-col items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl p-5 mb-5 animate-fade-in">
          <Loader2 className="w-7 h-7 text-[#0b91c9] animate-spin" />
          <p className="font-semibold text-ocean-dark text-sm">Analyzing resume…</p>
          <p className="text-xs text-[#0b91c9]">AI agents are extracting your data</p>
        </div>
      )}

      {/* Action */}
      <Button
        onClick={handleProcess}
        disabled={!file || isProcessing}
        className="w-full h-11 bg-ocean-dark hover:bg-[#013a63] text-white font-semibold rounded-xl text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isProcessing
          ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing…</>
          : <><UploadCloud className="mr-2 h-4 w-4" /> Process Resume</>
        }
      </Button>
    </div>
  );
}
