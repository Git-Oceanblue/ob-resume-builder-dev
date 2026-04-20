'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, BarChart2 } from 'lucide-react';
import type { TokenStats } from '@/types/resume';

const AGENT_LABELS: Record<string, { label: string; icon: string }> = {
  header:         { label: 'Header',         icon: '👤' },
  summary:        { label: 'Summary',        icon: '📝' },
  experience:     { label: 'Experience',     icon: '💼' },
  education:      { label: 'Education',      icon: '🎓' },
  skills:         { label: 'Skills',         icon: '⚙️' },
  certifications: { label: 'Certifications', icon: '🏆' },
};

const fmt  = (n: number) => Number(n || 0).toLocaleString();
const cost = (n: number) => `$${Number(n || 0).toFixed(5)}`;

export default function TokenDashboard({ tokenStats }: { tokenStats: TokenStats }) {
  const [expanded, setExpanded] = useState(false);

  const breakdown    = tokenStats.agentBreakdown || {};
  const hasBreakdown = Object.keys(breakdown).length > 0;
  const totalTime    = Object.values(breakdown).reduce((sum, a) => sum + (a?.processingTime || 0), 0);

  return (
    <div className="bg-gradient-to-br from-slate-50 to-blue-50 border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="px-5 py-3.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-[#0b91c9] flex-shrink-0" />
          <span className="text-sm font-semibold text-slate-700">Processing Analytics</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span><span className="font-bold text-slate-700">{fmt(tokenStats.promptTokens)}</span> in</span>
          <span><span className="font-bold text-slate-700">{fmt(tokenStats.completionTokens)}</span> out</span>
          <span className="font-bold text-emerald-600 text-sm">{cost(tokenStats.cost)}</span>
          {totalTime > 0 && <span><span className="font-bold text-slate-700">{totalTime.toFixed(1)}s</span></span>}
          {hasBreakdown && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="text-[#0b91c9] hover:text-ocean-dark font-medium flex items-center gap-1 ml-1"
            >
              {expanded ? <><ChevronUp className="w-3.5 h-3.5" /> Hide</> : <><ChevronDown className="w-3.5 h-3.5" /> Details</>}
            </button>
          )}
        </div>
      </div>

      {expanded && hasBreakdown && (
        <div className="border-t border-slate-200 px-5 pb-4 pt-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Object.entries(breakdown).map(([agentId, stats]) => {
              if (!stats) return null;
              const meta = AGENT_LABELS[agentId] ?? { label: agentId, icon: '🤖' };
              return (
                <div key={agentId} className="bg-white rounded-xl border border-slate-100 p-3 shadow-sm">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-base">{meta.icon}</span>
                    <span className="text-xs font-semibold text-slate-600">{meta.label}</span>
                  </div>
                  <div className="text-xs text-slate-500 space-y-0.5">
                    <div className="flex justify-between">
                      <span>Input</span>
                      <span className="font-medium text-slate-700">{fmt(stats.promptTokens)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Output</span>
                      <span className="font-medium text-slate-700">{fmt(stats.completionTokens)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Cost</span>
                      <span className="font-medium text-emerald-600">{cost(stats.cost)}</span>
                    </div>
                    {stats.processingTime != null && (
                      <div className="flex justify-between">
                        <span>Time</span>
                        <span className="font-medium text-slate-700">{stats.processingTime.toFixed(1)}s</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
