'use client';

import React, { useState, useEffect } from 'react';
import { Download, Cloud, Check, List, ExternalLink, ArrowLeft, Loader2, FileDown, ChevronDown } from 'lucide-react';
import type { ResumeData } from '@/types/resume';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');

const US_STATES = [
  'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut',
  'Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa',
  'Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan',
  'Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada',
  'New Hampshire','New Jersey','New Mexico','New York','North Carolina',
  'North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island',
  'South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont',
  'Virginia','Washington','West Virginia','Wisconsin','Wyoming',
];

type Action = 'download' | 'save_s3';

interface SavedResume { key: string; candidateName: string; lastModified: string; sizeBytes: number; }
interface SavedResult  { key?: string; downloadUrl?: string; }

export default function SaveStep({ resumeData, onDownload, onBack }: {
  resumeData: ResumeData;
  onDownload: () => Promise<void>;
  onBack: () => void;
}) {
  const [targetState, setTargetState] = useState('Ohio');
  const [action, setAction]           = useState<Action>('download');
  const [stateOpen, setStateOpen]     = useState(false);

  const [saving, setSaving]           = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [saved, setSaved]             = useState<SavedResult | null>(null);
  const [savedList, setSavedList]     = useState<SavedResume[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [awsEnabled, setAwsEnabled]   = useState(false);
  const [error, setError]             = useState('');
  const [success, setSuccess]         = useState('');

  const candidateName = resumeData?.name || 'Resume';
  const initials = candidateName.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();

  useEffect(() => {
    const load = async () => {
      try {
        setListLoading(true);
        const res  = await fetch(`${API_BASE}/api/resumes`);
        const data = await res.json() as { awsEnabled?: boolean; resumes?: SavedResume[] };
        setAwsEnabled(data.awsEnabled ?? false);
        setSavedList(data.resumes || []);
      } catch { setAwsEnabled(false); }
      finally  { setListLoading(false); }
    };
    load();
  }, []);

  const handleExecute = async () => {
    setError(''); setSuccess('');
    if (action === 'download') {
      setDownloading(true);
      try {
        await onDownload();
        setSuccess('Resume downloaded successfully.');
      } catch { setError('Download failed. Please try again.'); }
      finally { setDownloading(false); }
    } else {
      if (!awsEnabled) { setError('AWS S3 is not configured. Please set RESUMES_S3_BUCKET.'); return; }
      setSaving(true);
      try {
        const res = await fetch(`${API_BASE}/api/save-resume`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resumeData, targetState }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as SavedResult;
        setSaved(data);
        setSuccess('Resume saved to AWS S3 successfully.');
        const listRes  = await fetch(`${API_BASE}/api/resumes`);
        const listData = await listRes.json() as { resumes?: SavedResume[] };
        setSavedList(listData.resumes || []);
      } catch (err) { setError(`Save failed: ${err instanceof Error ? err.message : String(err)}`); }
      finally { setSaving(false); }
    }
  };

  const isLoading = downloading || saving;

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-br from-slate-50 via-blue-50/20 to-indigo-50/30">
      <div className="max-w-xl mx-auto px-6 py-10 space-y-4">

        {/* Candidate banner */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-ocean-dark to-[#0a4a8a] flex items-center justify-center text-white font-bold text-base flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold mb-0.5">Ready to Export</p>
            <h2 className="text-lg font-bold text-slate-900 truncate">{candidateName}</h2>
            {resumeData?.title && <p className="text-sm text-slate-500 truncate">{resumeData.title}</p>}
          </div>
          <span className="flex-shrink-0 text-[11px] font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full">
            ✓ Processed
          </span>
        </div>

        {/* Main action card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-800">Export Options</h3>
            <p className="text-xs text-slate-500 mt-0.5">Choose how you want to export this resume</p>
          </div>

          <div className="p-5 space-y-4">

            {/* State selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
                Target State
              </label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setStateOpen(v => !v)}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 hover:border-[#0b91c9] focus:outline-none focus:ring-2 focus:ring-[#0b91c9]/20 focus:border-[#0b91c9] transition-colors"
                >
                  <span>{targetState || 'Select a state…'}</span>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${stateOpen ? 'rotate-180' : ''}`} />
                </button>
                {stateOpen && (
                  <div className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                    <div className="max-h-48 overflow-y-auto">
                      {US_STATES.map(s => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => { setTargetState(s); setStateOpen(false); }}
                          className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                            s === targetState
                              ? 'bg-[#0b91c9]/10 text-[#0b6cb5] font-semibold'
                              : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Action selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">
                Action
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAction('download')}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                    action === 'download'
                      ? 'border-ocean-dark bg-ocean-dark/5 shadow-sm'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                    action === 'download' ? 'bg-ocean-dark' : 'bg-slate-100'
                  }`}>
                    <FileDown className={`w-4 h-4 ${action === 'download' ? 'text-white' : 'text-slate-500'}`} />
                  </div>
                  <div className="text-center">
                    <p className={`text-xs font-bold ${action === 'download' ? 'text-ocean-dark' : 'text-slate-700'}`}>
                      Download DOCX
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">Save to device</p>
                  </div>
                  {action === 'download' && (
                    <span className="text-[10px] font-bold bg-ocean-dark text-white px-2 py-0.5 rounded-full">Selected</span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setAction('save_s3')}
                  disabled={!awsEnabled}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                    !awsEnabled
                      ? 'border-dashed border-slate-200 opacity-40 cursor-not-allowed bg-white'
                      : action === 'save_s3'
                        ? 'border-emerald-600 bg-emerald-50 shadow-sm'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                    action === 'save_s3' ? 'bg-emerald-600' : 'bg-slate-100'
                  }`}>
                    {saved
                      ? <Check className={`w-4 h-4 ${action === 'save_s3' ? 'text-white' : 'text-slate-500'}`} />
                      : <Cloud className={`w-4 h-4 ${action === 'save_s3' ? 'text-white' : 'text-slate-500'}`} />
                    }
                  </div>
                  <div className="text-center">
                    <p className={`text-xs font-bold ${action === 'save_s3' ? 'text-emerald-700' : 'text-slate-700'}`}>
                      Save to S3
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {!awsEnabled ? 'Not configured' : 'AWS cloud storage'}
                    </p>
                  </div>
                  {action === 'save_s3' && awsEnabled && (
                    <span className="text-[10px] font-bold bg-emerald-600 text-white px-2 py-0.5 rounded-full">Selected</span>
                  )}
                </button>
              </div>
            </div>

            {/* Execute button */}
            <button
              type="button"
              onClick={handleExecute}
              disabled={isLoading}
              className={`w-full h-11 flex items-center justify-center gap-2 rounded-xl font-semibold text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-sm ${
                action === 'download'
                  ? 'bg-ocean-dark hover:bg-[#013a63] text-white'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }`}
            >
              {isLoading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</>
              ) : action === 'download' ? (
                <><Download className="w-4 h-4" /> Download DOCX for {targetState}</>
              ) : (
                <><Cloud className="w-4 h-4" /> Save to S3 · {targetState}</>
              )}
            </button>

            {/* Feedback */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-xs">
                {error}
              </div>
            )}
            {success && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl px-4 py-3 text-xs flex items-center gap-2">
                <Check className="w-3.5 h-3.5 flex-shrink-0" /> {success}
              </div>
            )}
            {saved?.downloadUrl && (
              <a href={saved.downloadUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 text-xs text-[#0b91c9] hover:underline">
                <ExternalLink className="w-3.5 h-3.5" /> View presigned S3 download link
              </a>
            )}
          </div>
        </div>

        {/* Saved resumes list */}
        {awsEnabled && savedList.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
              <List className="w-4 h-4 text-[#0b91c9]" />
              <span className="font-semibold text-slate-700 text-sm">Previously Saved</span>
              <span className="ml-auto text-xs text-slate-400">{savedList.length} files</span>
            </div>
            {listLoading ? (
              <div className="p-5 text-center text-sm text-slate-400 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading…
              </div>
            ) : (
              <ul className="divide-y divide-slate-50">
                {savedList.slice(0, 6).map(r => (
                  <li key={r.key} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                      <Cloud className="w-3.5 h-3.5 text-[#0b91c9]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate">{r.candidateName}</p>
                      <p className="text-xs text-slate-400">
                        {new Date(r.lastModified).toLocaleDateString()} · {(r.sizeBytes / 1024).toFixed(1)} KB
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Back */}
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-600 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Edit & Preview
        </button>

      </div>
    </div>
  );
}
