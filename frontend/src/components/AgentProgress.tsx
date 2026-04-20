'use client';

import React from 'react';
import type { AgentStatuses, AgentInfo } from '@/types/resume';

const AGENTS: { id: string; label: string }[] = [
  { id: 'preprocessor',   label: 'File Preprocessor' },
  { id: 'header',         label: 'Header Agent' },
  { id: 'summary',        label: 'Summary Agent' },
  { id: 'experience',     label: 'Experience Agent' },
  { id: 'education',      label: 'Education Agent' },
  { id: 'skills',         label: 'Skills Agent' },
  { id: 'certifications', label: 'Certifications Agent' },
  { id: 'validator',      label: 'Validator & Normalizer' },
];

function fmtTime(n?: number) { return n != null ? `${n.toFixed(1)}s` : ''; }
function fmtTokens(n?: number) { return !n ? '' : n >= 1000 ? `${(n/1000).toFixed(1)}k` : String(n); }

export default function AgentProgress({ agentStatuses, fromCache }: {
  agentStatuses: AgentStatuses; fromCache: boolean;
}) {
  if (fromCache) {
    return (
      <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-5 text-white text-center">
          <p className="text-2xl font-bold">⚡</p>
          <p className="font-bold text-lg mt-1">Instant Cache Hit</p>
          <p className="text-emerald-100 text-sm mt-1">Result retrieved from DynamoDB — no processing needed.</p>
        </div>
      </div>
    );
  }

  const agents = AGENTS.map(({ id, label }) => {
    const raw  = agentStatuses[id];
    const info = raw && typeof raw === 'object' ? (raw as AgentInfo) : null;
    const status = info ? info.status : (raw as string | undefined) ?? 'pending';
    return { id, label, status, info };
  });

  const completed = agents.filter(a => a.status === 'complete').length;
  const pct       = Math.round((completed / agents.length) * 100);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-ocean-dark to-[#0a4a8a] px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-white font-bold text-sm">AI Agent Pipeline</p>
            <p className="text-slate-300 text-xs mt-0.5">Multi-agent resume extraction</p>
          </div>
          <span className="text-white text-sm font-mono bg-white/10 px-2.5 py-1 rounded-full">
            {completed}/{agents.length}
          </span>
        </div>
        {/* Progress bar */}
        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#0b91c9] rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Agent list */}
      <div className="divide-y divide-slate-50">
        {agents.map(({ id, label, status, info }) => (
          <div
            key={id}
            className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${
              status === 'running'  ? 'bg-blue-50/70' :
              status === 'complete' ? 'bg-emerald-50/40' :
              status === 'error'    ? 'bg-red-50/40' : ''
            }`}
          >
            {/* Status indicator */}
            <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
              status === 'complete' ? 'bg-emerald-100 text-emerald-600' :
              status === 'running'  ? 'bg-blue-100' :
              status === 'error'    ? 'bg-red-100 text-red-500' :
              'bg-slate-100'
            }`}>
              {status === 'complete' ? '✓' :
               status === 'running'  ? (
                 <svg className="w-3.5 h-3.5 text-blue-500 animate-spin" fill="none" viewBox="0 0 24 24">
                   <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                   <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                 </svg>
               ) :
               status === 'error' ? '✗' :
               <span className="w-2 h-2 rounded-full bg-slate-300 block" />
              }
            </div>

            <div className="flex-1 min-w-0">
              <p className={`text-xs font-medium truncate ${status === 'pending' ? 'text-slate-400' : 'text-slate-700'}`}>
                {label}
              </p>
              {status === 'running' && info?.desc && (
                <p className="text-[11px] text-blue-500 truncate mt-0.5">{info.desc}</p>
              )}
              {status === 'complete' && info?.tokenStats && (
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {fmtTokens(info.tokenStats.promptTokens)} in · {fmtTokens(info.tokenStats.completionTokens)} out
                  {info.processingTime ? ` · ${fmtTime(info.processingTime)}` : ''}
                </p>
              )}
            </div>

            {status === 'complete' && info?.tokenStats && (
              <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full flex-shrink-0">
                ${(info.tokenStats.cost || 0).toFixed(5)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
