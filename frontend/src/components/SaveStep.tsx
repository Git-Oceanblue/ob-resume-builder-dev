'use client';

import React, { useState, useEffect } from 'react';
import { Download, Cloud, Check, List, ExternalLink, ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
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

interface SavedResume {
  key: string;
  candidateName: string;
  lastModified: string;
  sizeBytes: number;
}

interface SavedResult {
  key?: string;
  downloadUrl?: string;
}

export default function SaveStep({
  resumeData,
  onDownload,
  onBack,
}: {
  resumeData: ResumeData;
  onDownload: () => void;
  onBack: () => void;
}) {
  const [targetState, setTargetState] = useState('');
  const [saving, setSaving]           = useState(false);
  const [saved, setSaved]             = useState<SavedResult | null>(null);
  const [savedList, setSavedList]     = useState<SavedResume[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [awsEnabled, setAwsEnabled]   = useState(false);
  const [error, setError]             = useState('');

  const candidateName = resumeData?.name || 'Resume';

  useEffect(() => {
    const load = async () => {
      try {
        setListLoading(true);
        const res  = await fetch(`${API_BASE}/api/resumes`);
        const data = await res.json() as { awsEnabled?: boolean; resumes?: SavedResume[] };
        setAwsEnabled(data.awsEnabled ?? false);
        setSavedList(data.resumes || []);
      } catch {
        setAwsEnabled(false);
      } finally {
        setListLoading(false);
      }
    };
    load();
  }, []);

  const handleSaveToS3 = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/save-resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeData, targetState }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as SavedResult;
      setSaved(data);
      const listRes  = await fetch(`${API_BASE}/api/resumes`);
      const listData = await listRes.json() as { resumes?: SavedResume[] };
      setSavedList(listData.resumes || []);
    } catch (err: unknown) {
      setError(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/40">
      <div className="max-w-3xl mx-auto px-6 py-10 space-y-5">

        {/* Candidate banner */}
        <Card className="border-gray-100">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-ocean-dark to-[#0b6cb5] flex items-center justify-center text-white font-bold text-xl flex-shrink-0">
              {candidateName.charAt(0)}
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold">Ready to Export</p>
              <h2 className="text-xl font-bold text-gray-800">{candidateName}</h2>
              <p className="text-sm text-gray-500">{resumeData?.title || 'Resume'}</p>
            </div>
            <div className="ml-auto">
              <Badge variant="success">✓ Processed</Badge>
            </div>
          </CardContent>
        </Card>

        {/* State selector */}
        <Card className="border-gray-100">
          <CardContent className="p-5">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Target State <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <Select value={targetState} onValueChange={setTargetState}>
              <SelectTrigger>
                <SelectValue placeholder="— Select a US state —" />
              </SelectTrigger>
              <SelectContent>
                {US_STATES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-400 mt-1.5">Used as metadata when saving to S3.</p>
          </CardContent>
        </Card>

        {/* Action cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Download locally */}
          <button
            onClick={onDownload}
            className="group bg-white hover:bg-gradient-to-br hover:from-ocean-dark hover:to-[#0b6cb5] border border-gray-200 hover:border-transparent rounded-2xl p-6 text-left transition-all duration-300 shadow-sm hover:shadow-lg"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-50 group-hover:bg-white/20 flex items-center justify-center mb-4 transition-colors">
              <Download className="w-5 h-5 text-[#0b91c9] group-hover:text-white" />
            </div>
            <h3 className="font-bold text-gray-800 group-hover:text-white text-base">Download DOCX</h3>
            <p className="text-sm text-gray-500 group-hover:text-blue-100 mt-1">
              Save to your computer as a Word document.
            </p>
          </button>

          {/* Save to S3 */}
          <div className={`rounded-2xl border p-6 shadow-sm ${
            awsEnabled ? 'bg-white border-gray-200' : 'bg-gray-50 border-dashed border-gray-200 opacity-60'
          }`}>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center mb-4">
              {saved ? <Check className="w-5 h-5 text-emerald-600" /> : <Cloud className="w-5 h-5 text-emerald-600" />}
            </div>
            <h3 className="font-bold text-gray-800 text-base">
              {saved ? 'Saved to S3 ✓' : 'Save to AWS S3'}
            </h3>
            <p className="text-sm text-gray-500 mt-1 mb-4">
              {!awsEnabled
                ? 'AWS S3 not configured. Set RESUMES_S3_BUCKET to enable.'
                : saved
                  ? `Key: ${saved.key?.split('/').pop()}`
                  : 'Store permanently in your AWS S3 bucket.'}
            </p>
            {awsEnabled && !saved && (
              <Button
                onClick={handleSaveToS3}
                disabled={saving}
                variant="success"
                size="sm"
                className="w-full"
              >
                {saving ? <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Saving…</> : <><Cloud className="mr-2 h-3.5 w-3.5" /> Save to S3</>}
              </Button>
            )}
            {saved?.downloadUrl && (
              <a
                href={saved.downloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 flex items-center justify-center gap-1.5 text-xs text-[#0b91c9] hover:underline"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Presigned download link
              </a>
            )}
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Saved resumes list */}
        {awsEnabled && savedList.length > 0 && (
          <Card className="border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50 flex items-center gap-2">
              <List className="w-4 h-4 text-[#0b91c9]" />
              <span className="font-semibold text-gray-700 text-sm">Previously Saved Resumes</span>
              <span className="ml-auto text-xs text-gray-400">{savedList.length} files</span>
            </div>
            {listLoading ? (
              <div className="p-6 text-center text-sm text-gray-400 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading…
              </div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {savedList.slice(0, 8).map((r) => (
                  <li key={r.key} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
                    <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                      <Cloud className="w-3.5 h-3.5 text-[#0b91c9]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-700 truncate">{r.candidateName}</p>
                      <p className="text-xs text-gray-400 truncate">
                        {new Date(r.lastModified).toLocaleString()} · {(r.sizeBytes / 1024).toFixed(1)} KB
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {/* Back button */}
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Edit & Preview
        </button>
      </div>
    </div>
  );
}
