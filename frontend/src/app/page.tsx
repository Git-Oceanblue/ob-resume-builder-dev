'use client';

import React, { useState, useCallback, useRef } from 'react';
import Image from 'next/image';
import { CheckIcon } from 'lucide-react';
import FileUpload from '@/components/FileUpload';
import ResumeForm from '@/components/ResumeForm';
import GeneratedResume from '@/components/GeneratedResume';
import AgentProgress from '@/components/AgentProgress';
import SaveStep from '@/components/SaveStep';
import TokenDashboard from '@/components/TokenDashboard';
import type { ResumeData, AgentStatuses } from '@/types/resume';

// ── Step indicator ──────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: 'Upload',          short: '1' },
  { id: 2, label: 'Edit & Preview',  short: '2' },
  { id: 3, label: 'Save & Download', short: '3' },
];

function StepIndicator({
  current,
  resumeData,
  onStepClick,
}: {
  current: number;
  resumeData: ResumeData | null;
  onStepClick: (id: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {STEPS.map((s, i) => {
        const reachable = s.id === 1 || (s.id >= 2 && !!resumeData);
        const active = current === s.id;
        const done = current > s.id;

        return (
          <React.Fragment key={s.id}>
            <button
              disabled={!reachable}
              onClick={() => reachable && onStepClick(s.id)}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold transition-all duration-200 border
                ${active
                  ? 'bg-white text-ocean-dark shadow-md border-white'
                  : done
                    ? 'bg-white/20 text-white border-white/40 hover:bg-white/30 cursor-pointer'
                    : reachable
                      ? 'bg-white/10 text-blue-200 border-white/20 hover:bg-white/20 cursor-pointer'
                      : 'bg-white/5 text-white/30 border-white/10 cursor-not-allowed'
                }`}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold
                  ${active ? 'bg-ocean-dark text-white' : 'bg-white/20 text-white'}`}
              >
                {done ? <CheckIcon className="w-3 h-3" /> : s.short}
              </span>
              <span className="hidden sm:inline">{s.label}</span>
            </button>

            {i < STEPS.length - 1 && (
              <div className="flex items-center gap-0.5 px-1">
                <div className={`h-px w-3 ${current > s.id ? 'bg-white' : 'bg-white/20'}`} />
                <div className={`w-1.5 h-1.5 rounded-full ${current > s.id ? 'bg-white' : 'bg-white/20'}`} />
                <div className={`h-px w-3 ${current > s.id ? 'bg-white' : 'bg-white/20'}`} />
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── Feature pills ───────────────────────────────────────────────────────────

const FEATURE_PILLS = [
  { icon: '🤖', label: '8 Specialized Agents' },
  { icon: '⚡', label: 'DynamoDB Caching' },
  { icon: '☁️', label: 'AWS S3 Storage' },
  { icon: '📊', label: 'Token Analytics' },
];

// ── Main App ────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [step, setStep]                   = useState(1);
  const [resumeData, setResumeData]       = useState<ResumeData | null>(null);
  const [liveData, setLiveData]           = useState<ResumeData | null>(null);
  const [isProcessing, setIsProcessing]   = useState(false);
  const [fromCache, setFromCache]         = useState(false);
  const [agentStatuses, setAgentStatuses] = useState<AgentStatuses>({});

  const resumeRef = useRef<HTMLDivElement>(null);

  const handleAgentEvent = useCallback((event: Record<string, unknown>) => {
    if (!event?.type) return;
    if (event.type === 'cache_hit') { setFromCache(true); return; }
    if (event.type === 'agent_start') {
      setIsProcessing(true);
      setAgentStatuses(prev => ({
        ...prev,
        [event.agentId as string]: { status: 'running', desc: event.desc as string },
      }));
      return;
    }
    if (event.type === 'agent_complete') {
      setAgentStatuses(prev => ({
        ...prev,
        [event.agentId as string]: {
          status: event.success ? 'complete' : 'error',
          tokenStats: event.tokenStats as never ?? null,
          processingTime: event.processingTime as number,
        },
      }));
    }
  }, []);

  const handleResumeDataExtracted = useCallback((data: ResumeData) => {
    setResumeData(data);
    setLiveData(data);
    setIsProcessing(false);
    setStep(2);
  }, []);

  const handleFormChange  = useCallback((data: ResumeData) => setLiveData(data), []);
  const handleFormSubmit  = useCallback((data: ResumeData) => { setResumeData(data); setLiveData(data); }, []);
  const handleBack        = useCallback(() => setStep(s => Math.max(1, s - 1)), []);
  const handleGoToSave    = useCallback(() => setStep(3), []);
  const handleDownload    = useCallback(() => window.dispatchEvent(new CustomEvent('triggerResumeDownload')), []);

  const handleUploadNew = useCallback(() => {
    setStep(1); setResumeData(null); setLiveData(null);
    setAgentStatuses({}); setIsProcessing(false); setFromCache(false);
  }, []);

  const showAgentPanel = isProcessing || Object.keys(agentStatuses).length > 0;

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-slate-50">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 bg-gradient-to-r from-ocean-dark via-[#0a4a8a] to-[#0b6cb5] shadow-2xl z-20">
        <div className="px-6 py-3">
          <div className="flex items-center justify-between">
            <button
              onClick={handleUploadNew}
              className="flex items-center space-x-3 hover:opacity-90 transition-opacity"
            >
              <div className="bg-white/10 backdrop-blur-sm p-1.5 rounded-xl border border-white/20 shadow-lg">
                <Image src="/logo.png" alt="OceanBlue Solutions" width={36} height={36} className="rounded-lg object-cover" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white tracking-tight leading-tight">OceanBlue Solutions</h1>
                <p className="text-[#0b91c9] text-[10px] font-semibold tracking-[0.2em] uppercase opacity-90">
                  Resume Automation Platform
                </p>
              </div>
            </button>

            <StepIndicator current={step} resumeData={resumeData} onStepClick={setStep} />
          </div>
        </div>
      </header>

      {/* ── Main content ────────────────────────────────────────────── */}
      <main className="flex-1 overflow-hidden bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/40">

        {/* ─── STEP 1: Upload ──────────────────────────────────────── */}
        {step === 1 && (
          <div className="h-full overflow-y-auto">
            <div className="container mx-auto px-6 py-10 max-w-6xl">

              {!showAgentPanel && (
                <div className="text-center mb-10 animate-fade-in">
                  <h2 className="text-4xl font-extrabold text-ocean-dark mb-3 tracking-tight">
                    AI-Powered Resume Extraction
                  </h2>
                  <p className="text-gray-500 text-lg max-w-xl mx-auto">
                    Multi-agent pipeline extracts every detail with precision — then lets you edit, preview, and save.
                  </p>
                  <div className="flex flex-wrap justify-center gap-3 mt-6">
                    {FEATURE_PILLS.map(({ icon, label }) => (
                      <span
                        key={label}
                        className="flex items-center gap-1.5 bg-white border border-gray-200 text-gray-600 text-sm px-3 py-1.5 rounded-full shadow-sm font-medium"
                      >
                        <span>{icon}</span>{label}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className={showAgentPanel ? 'grid grid-cols-1 lg:grid-cols-2 gap-8 items-start' : ''}>
                <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden p-8">
                  <FileUpload
                    onResumeDataExtracted={handleResumeDataExtracted}
                    setLoading={setIsProcessing}
                    onAgentEvent={handleAgentEvent}
                  />
                </div>

                {showAgentPanel && (
                  <div className="space-y-4 animate-fade-in">
                    <AgentProgress agentStatuses={agentStatuses} fromCache={fromCache} />
                  </div>
                )}
              </div>

              {!showAgentPanel && (
                <p className="text-center text-xs text-gray-400 mt-6">
                  Files are processed securely. Your data is never stored without your consent.
                </p>
              )}
            </div>
          </div>
        )}

        {/* ─── STEP 2: Edit & Preview ───────────────────────────────── */}
        {step === 2 && liveData && (
          <div className="flex h-full animate-fade-in">
            {/* Left — Form editor */}
            <div className="w-[52%] h-full overflow-y-auto border-r border-gray-200 bg-white">
              <ResumeForm
                initialData={resumeData!}
                onSubmit={handleFormSubmit}
                onChange={handleFormChange}
                onBack={handleUploadNew}
              />
            </div>

            {/* Right — Live preview */}
            <div className="w-[48%] h-full overflow-y-auto bg-slate-50 flex flex-col">
              {liveData?.tokenStats && (
                <div className="px-4 pt-4">
                  <TokenDashboard tokenStats={liveData.tokenStats} />
                </div>
              )}
              <GeneratedResume
                ref={resumeRef}
                resumeData={liveData}
                previewMode
                onGoToSave={handleGoToSave}
              />
            </div>
          </div>
        )}

        {/* ─── STEP 3: Save & Download ─────────────────────────────── */}
        {step === 3 && resumeData && (
          <SaveStep
            resumeData={resumeData}
            onDownload={handleDownload}
            onBack={handleBack}
          />
        )}

        {/* GeneratedResume kept mounted in step 3 (hidden) so download event works */}
        {step === 3 && liveData && (
          <div className="hidden">
            <GeneratedResume resumeData={liveData} previewMode />
          </div>
        )}
      </main>
    </div>
  );
}
