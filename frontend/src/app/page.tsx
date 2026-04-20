'use client';

import React, { useState, useCallback } from 'react';
import Image from 'next/image';
import { Check } from 'lucide-react';
import FileUpload from '@/components/FileUpload';
import ResumeForm from '@/components/ResumeForm';
import GeneratedResume from '@/components/states/ohio/GeneratedResume';
import AgentProgress from '@/components/AgentProgress';
import SaveStep from '@/components/SaveStep';
import { TEMPLATES, DEFAULT_TEMPLATE } from '@/templates';
import type { ResumeData, AgentStatuses } from '@/types/resume';

const STEPS = [
  { id: 1, label: 'Upload' },
  { id: 2, label: 'Edit & Preview' },
  { id: 3, label: 'Export' },
];

function StepBar({ current, canAdvance, onStepClick }: {
  current: number; canAdvance: boolean; onStepClick: (id: number) => void;
}) {
  return (
    <nav className="flex items-center gap-1.5">
      {STEPS.map((s, i) => {
        const reachable = s.id === 1 || canAdvance;
        const active = current === s.id;
        const done = current > s.id;
        return (
          <React.Fragment key={s.id}>
            <button
              disabled={!reachable}
              onClick={() => reachable && onStepClick(s.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                active ? 'bg-white text-ocean-dark border-white shadow-md' :
                done   ? 'bg-white/20 text-white border-white/30 hover:bg-white/30 cursor-pointer' :
                reachable ? 'bg-white/10 text-white/80 border-white/20 hover:bg-white/20 cursor-pointer' :
                'bg-transparent text-white/30 border-transparent cursor-not-allowed'
              }`}
            >
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                active ? 'bg-ocean-dark text-white' : done ? 'bg-white/30 text-white' : 'bg-white/20 text-white'
              }`}>
                {done ? <Check className="w-3 h-3" /> : s.id}
              </span>
              <span className="hidden sm:inline">{s.label}</span>
            </button>
            {i < STEPS.length - 1 && (
              <div className={`w-5 h-px ${done ? 'bg-white/60' : 'bg-white/20'}`} />
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}

export default function HomePage() {
  const [step, setStep]                   = useState(1);
  const [resumeData, setResumeData]       = useState<ResumeData | null>(null);
  const [liveData, setLiveData]           = useState<ResumeData | null>(null);
  const [isProcessing, setIsProcessing]   = useState(false);
  const [fromCache, setFromCache]         = useState(false);
  const [agentStatuses, setAgentStatuses] = useState<AgentStatuses>({});

  const handleAgentEvent = useCallback((event: Record<string, unknown>) => {
    if (!event?.type) return;
    if (event.type === 'cache_hit') { setFromCache(true); return; }
    if (event.type === 'agent_start') {
      setIsProcessing(true);
      setAgentStatuses(prev => ({
        ...prev,
        [event.agentId as string]: { status: 'running', desc: event.desc as string },
      }));
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

  const handleDownloadDocx = useCallback(async () => {
    if (!liveData) return;
    try {
      await TEMPLATES[DEFAULT_TEMPLATE].buildDocx(liveData);
    } catch {
      alert('Error generating document. Please try again.');
    }
  }, [liveData]);

  const handleReset = useCallback(() => {
    setStep(1); setResumeData(null); setLiveData(null);
    setAgentStatuses({}); setIsProcessing(false); setFromCache(false);
  }, []);

  const showAgentPanel = isProcessing || Object.keys(agentStatuses).length > 0;

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-slate-50">

      {/* Header */}
      <header className="flex-shrink-0 bg-gradient-to-r from-[#002945] via-[#013a63] to-[#0a4a8a] shadow-xl z-20">
        <div className="px-5 h-[56px] flex items-center justify-between">
          <button onClick={handleReset} className="flex items-center gap-3 hover:opacity-90 transition-opacity group">
            <div className="bg-white/10 backdrop-blur-sm p-1.5 rounded-xl border border-white/20 group-hover:bg-white/20 transition-colors">
              <Image src="/logo.png" alt="OceanBlue" width={30} height={30} className="rounded-lg" />
            </div>
            <div className="leading-none">
              <p className="text-white font-bold text-sm tracking-tight">OceanBlue Solutions</p>
              <p className="text-[#4db8e8] text-[10px] font-medium tracking-[0.15em] uppercase mt-0.5">Resume Automation</p>
            </div>
          </button>
          <StepBar current={step} canAdvance={!!resumeData} onStepClick={setStep} />
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 overflow-hidden">

        {/* ── Step 1: Upload ── */}
        {step === 1 && (
          <div className="h-full overflow-y-auto bg-gradient-to-br from-slate-50 via-blue-50/20 to-indigo-50/30">
            <div className="max-w-5xl mx-auto px-6 py-10">

              {!showAgentPanel && (
                <div className="text-center mb-8 animate-fade-in">
                  <div className="inline-flex items-center gap-2 bg-[#0b91c9]/10 border border-[#0b91c9]/20 text-[#0b6cb5] text-xs font-semibold px-4 py-1.5 rounded-full mb-5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#0b91c9] animate-pulse" />
                    8-Agent AI Pipeline · Real-time Processing
                  </div>
                  <h2 className="text-4xl font-extrabold text-ocean-dark tracking-tight mb-3">
                    AI-Powered Resume Extraction
                  </h2>
                  <p className="text-slate-500 text-base max-w-md mx-auto leading-relaxed">
                    Upload any resume and our multi-agent pipeline extracts, structures, and formats every detail automatically.
                  </p>
                </div>
              )}

              <div className={showAgentPanel
                ? 'grid grid-cols-1 lg:grid-cols-2 gap-6 items-start'
                : 'max-w-lg mx-auto'
              }>
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <FileUpload
                    onResumeDataExtracted={handleResumeDataExtracted}
                    setLoading={setIsProcessing}
                    onAgentEvent={handleAgentEvent}
                  />
                </div>
                {showAgentPanel && (
                  <div className="animate-fade-in">
                    <AgentProgress agentStatuses={agentStatuses} fromCache={fromCache} />
                  </div>
                )}
              </div>

              {!showAgentPanel && (
                <div className="mt-8 flex justify-center">
                  <div className="flex items-center gap-8">
                    {[
                      { label: '8 Agents', sub: 'Parallel processing' },
                      { label: 'DynamoDB', sub: 'Smart caching' },
                      { label: 'AWS S3', sub: 'Cloud storage' },
                      { label: 'Ohio', sub: 'State template' },
                    ].map((f, i) => (
                      <React.Fragment key={f.label}>
                        {i > 0 && <div className="w-px h-8 bg-slate-200" />}
                        <div className="text-center">
                          <p className="text-sm font-bold text-ocean-dark">{f.label}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{f.sub}</p>
                        </div>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Step 2: Edit & Preview ── */}
        {step === 2 && liveData && (
          <div className="flex h-full animate-fade-in">
            <div className="w-[52%] min-w-0 h-full overflow-y-auto border-r border-slate-200 bg-white">
              <ResumeForm
                initialData={resumeData!}
                onSubmit={data => { setResumeData(data); setLiveData(data); }}
                onChange={data => setLiveData(data)}
                onBack={handleReset}
              />
            </div>
            <div className="w-[48%] min-w-0 h-full overflow-y-auto bg-slate-50">
              <GeneratedResume
                resumeData={liveData}
                previewMode
                onGoToSave={() => setStep(3)}
                onDownload={handleDownloadDocx}
              />
            </div>
          </div>
        )}

        {/* ── Step 3: Export ── */}
        {step === 3 && resumeData && (
          <SaveStep
            resumeData={resumeData}
            onDownload={handleDownloadDocx}
            onBack={() => setStep(2)}
          />
        )}

      </main>
    </div>
  );
}
