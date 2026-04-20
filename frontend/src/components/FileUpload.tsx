'use client';

import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, AlertCircle, Loader2, File } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import type { ResumeData } from '@/types/resume';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');

interface FileUploadProps {
  onResumeDataExtracted: (data: ResumeData) => void;
  setLoading: (v: boolean) => void;
  onAgentEvent: (event: Record<string, unknown>) => void;
}

function sanitizeResumeData(data: Record<string, unknown>): ResumeData {
  try {
    const raw = data as Record<string, unknown>;
    const sanitized: ResumeData = {
      name: (raw.name as string) || '',
      title: (raw.title as string) || '',
      requisitionNumber: (raw.requisitionNumber as string) || '',
      professionalSummary: Array.isArray(raw.professionalSummary)
        ? (raw.professionalSummary as string[]).flatMap((item) => {
            if (typeof item !== 'string') return [];
            if (item.includes('\u2022') || item.includes(' • '))
              return item.split(/\s*[•\u2022]\s*/).map((s) => s.trim()).filter(Boolean);
            return [item];
          })
        : [],
      summarySections: Array.isArray(raw.summarySections) ? (raw.summarySections as never[]) : [],
      subsections: Array.isArray(raw.subsections) ? (raw.subsections as never[]) : [],
      employmentHistory: Array.isArray(raw.employmentHistory) ? (raw.employmentHistory as never[]) : [],
      education: Array.isArray(raw.education) ? (raw.education as never[]) : [],
      certifications: Array.isArray(raw.certifications) ? (raw.certifications as never[]) : [],
      technicalSkills: (raw.technicalSkills && typeof raw.technicalSkills === 'object') ? (raw.technicalSkills as Record<string, string[]>) : {},
      skillCategories: Array.isArray(raw.skillCategories) ? (raw.skillCategories as never[]) : [],
      tokenStats: raw.tokenStats as never,
    };

    // Normalize employment history
    sanitized.employmentHistory = (sanitized.employmentHistory as never[]).map((job: Record<string, unknown>) => ({
      companyName: (job.companyName as string) || '',
      roleName: (job.roleName as string) || '',
      workPeriod: (job.workPeriod as string) || '',
      location: (job.location as string) || '',
      department: (job.department as string) || '',
      subRole: (job.subRole as string) || '',
      description: (job.description as string) || '',
      responsibilities: Array.isArray(job.responsibilities) ? job.responsibilities as string[] : [],
      projects: Array.isArray(job.projects) ? (job.projects as Record<string, unknown>[]).map((p) => ({
        projectName: (p.projectName as string) || '',
        projectLocation: (p.projectLocation as string) || '',
        projectResponsibilities: Array.isArray(p.projectResponsibilities) ? p.projectResponsibilities as string[] : [],
        keyTechnologies: (p.keyTechnologies as string) || '',
        period: (p.period as string) || '',
      })) : [],
      subsections: Array.isArray(job.subsections) ? (job.subsections as Record<string, unknown>[]).map((s) => ({
        title: (s.title as string) || '',
        content: Array.isArray(s.content) ? s.content as string[] : [],
      })) : [],
      keyTechnologies: (job.keyTechnologies as string) || '',
    })) as never;

    // Normalize summary sections
    const rawSummarySections = Array.isArray(raw.summarySections) ? raw.summarySections : (Array.isArray(raw.subsections) ? raw.subsections : []);
    sanitized.summarySections = (rawSummarySections as Record<string, unknown>[]).map((s) => ({
      title: (s.title as string) || '',
      content: Array.isArray(s.content) ? s.content as string[] : [],
    }));
    sanitized.subsections = sanitized.summarySections;

    // Normalize skill categories
    if (Array.isArray(raw.skillCategories)) {
      sanitized.skillCategories = (raw.skillCategories as Record<string, unknown>[]).map((c) => ({
        categoryName: (c.categoryName as string) || '',
        skills: Array.isArray(c.skills) ? c.skills as string[] : [],
        subCategories: Array.isArray(c.subCategories) ? (c.subCategories as Record<string, unknown>[]).map((s) => ({
          name: (s.name as string) || '',
          skills: Array.isArray(s.skills) ? s.skills as string[] : [],
        })) : [],
      }));
    }

    // Normalize education
    sanitized.education = (sanitized.education as never[]).map((e: Record<string, unknown>) => ({
      degree: (e.degree as string) || '',
      areaOfStudy: (e.areaOfStudy as string) || '',
      school: (e.school as string) || '',
      location: (e.location as string) || '',
      date: (e.date as string) || '',
      wasAwarded: e.wasAwarded !== undefined ? Boolean(e.wasAwarded) : true,
    })) as never;

    // Normalize certifications
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

export default function FileUpload({ onResumeDataExtracted, setLoading, onAgentEvent }: FileUploadProps) {
  const [file, setFile]               = useState<File | null>(null);
  const [error, setError]             = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const selected = acceptedFiles[0];
    if (!selected) return;
    const ext = '.' + selected.name.split('.').pop()!.toLowerCase();
    if (ext === '.doc') {
      setError('DOC files are not supported. Please use DOCX, PDF, or TXT.');
      return;
    }
    if (!['.pdf', '.docx', '.txt'].includes(ext)) {
      setError('Invalid file type. Please upload PDF, DOCX, or TXT.');
      return;
    }
    if (selected.size > 10 * 1024 * 1024) {
      setError('File size exceeds 10 MB.');
      return;
    }
    setError('');
    setFile(selected);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt'],
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) { setError('Please select a file.'); return; }

    setIsProcessing(true);
    setLoading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${API_BASE}/api/stream-resume-processing`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

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
            const data = JSON.parse(raw) as Record<string, unknown>;
            onAgentEvent(data);
            if (data.type === 'final_data') {
              onResumeDataExtracted(sanitizeResumeData(data.data as Record<string, unknown>));
              return;
            }
            if (data.type === 'error') {
              setError((data.message as string) || 'Processing error');
              return;
            }
          } catch { /* ignore parse errors */ }
        }
      }
    } catch (err: unknown) {
      setError(`Processing failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsProcessing(false);
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto animate-slide-up">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-[#0b91c9]/10 flex items-center justify-center">
          <File className="w-5 h-5 text-[#0b91c9]" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-ocean-dark">Upload Resume</h2>
          <p className="text-sm text-gray-500">PDF, DOCX, or TXT · max 10 MB</p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <Alert variant="destructive" className="mb-4 animate-fade-in">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={`relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-300 mb-5
          ${isDragActive
            ? 'border-[#0b91c9] bg-blue-50 shadow-lg scale-[1.02]'
            : 'border-gray-200 hover:border-[#0b91c9] hover:bg-blue-50/50 hover:shadow-md'
          }`}
      >
        <input {...getInputProps()} />
        <Upload
          className={`mx-auto w-12 h-12 mb-4 transition-all duration-300
            ${isDragActive ? 'text-[#0b91c9] scale-110' : 'text-gray-300'}`}
        />
        <h3 className="text-base font-semibold text-ocean-dark mb-1">
          {isDragActive ? 'Drop it here!' : 'Drag & drop your resume'}
        </h3>
        <p className="text-sm text-gray-500 mb-4">or click to browse files</p>
        <div className="flex justify-center gap-2">
          <Badge variant="success">PDF</Badge>
          <Badge variant="ocean">DOCX</Badge>
          <Badge variant="muted">TXT</Badge>
        </div>
        <p className="text-xs text-red-400 mt-3 font-medium">⚠ DOC files not supported</p>
      </div>

      {/* Selected file card */}
      {file && (
        <div className="bg-gradient-to-r from-ocean-dark to-[#0b6cb5] rounded-xl p-4 mb-5 text-white shadow-lg animate-fade-in flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">{file.name}</p>
            <p className="text-blue-200 text-xs">{(file.size / 1024 / 1024).toFixed(2)} MB · Ready</p>
          </div>
          <span className="text-xs bg-white/20 px-2 py-1 rounded-lg font-medium">✓</span>
        </div>
      )}

      {/* Processing state */}
      {isProcessing && (
        <div className="bg-blue-50 border border-[#0b91c9]/20 rounded-xl p-5 mb-5 text-center animate-fade-in">
          <Loader2 className="w-8 h-8 text-[#0b91c9] animate-spin mx-auto mb-2" />
          <p className="font-semibold text-ocean-dark">Processing resume…</p>
          <p className="text-sm text-[#0b91c9]">AI agents are extracting your data</p>
        </div>
      )}

      {/* Submit */}
      <Button
        onClick={handleSubmit}
        disabled={!file || isProcessing}
        variant="ocean"
        size="lg"
        className="w-full"
      >
        {isProcessing ? (
          <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing…</>
        ) : (
          <><Upload className="mr-2 h-4 w-4" /> Process Resume</>
        )}
      </Button>
    </div>
  );
}
