import React, { useState } from 'react';

const AGENT_LABELS = {
  header:         { label: 'Header',         icon: '👤' },
  summary:        { label: 'Summary',        icon: '📝' },
  experience:     { label: 'Experience',     icon: '💼' },
  education:      { label: 'Education',      icon: '🎓' },
  skills:         { label: 'Skills',         icon: '⚙️' },
  certifications: { label: 'Certifications', icon: '🏆' },
};

const fmtNum = (n) => Number(n || 0).toLocaleString();
const fmtCost = (n) => `$${Number(n || 0).toFixed(5)}`;

export default function TokenDashboard({ tokenStats }) {
  const [expanded, setExpanded] = useState(false);

  if (!tokenStats) return null;

  const breakdown = tokenStats.agentBreakdown || {};
  const hasBreakdown = Object.keys(breakdown).length > 0;

  const totalTime = Object.values(breakdown).reduce(
    (sum, a) => sum + (a?.processingTime || 0), 0
  );

  return (
    <div className="bg-gradient-to-br from-slate-50 to-blue-50 border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      {/* Top summary bar */}
      <div className="px-5 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-ocean-blue flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <span className="text-sm font-semibold text-slate-700">Processing Analytics</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-500">
          <span><span className="font-bold text-slate-700">{fmtNum(tokenStats.promptTokens)}</span> in</span>
          <span><span className="font-bold text-slate-700">{fmtNum(tokenStats.completionTokens)}</span> out</span>
          <span className="font-bold text-emerald-600 text-sm">{fmtCost(tokenStats.cost)}</span>
          {totalTime > 0 && (
            <span><span className="font-bold text-slate-700">{totalTime.toFixed(1)}s</span></span>
          )}
          {hasBreakdown && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="text-ocean-blue hover:text-ocean-dark font-medium ml-2"
            >
              {expanded ? 'Hide ▲' : 'Details ▼'}
            </button>
          )}
        </div>
      </div>

      {/* Expanded breakdown */}
      {expanded && hasBreakdown && (
        <div className="border-t border-slate-200 px-5 pb-4 pt-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Object.entries(breakdown).map(([agentId, stats]) => {
              if (!stats) return null;
              const meta = AGENT_LABELS[agentId] || { label: agentId, icon: '🤖' };
              return (
                <div key={agentId} className="bg-white rounded-xl border border-slate-100 p-3 shadow-sm">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-base">{meta.icon}</span>
                    <span className="text-xs font-semibold text-slate-600">{meta.label}</span>
                  </div>
                  <div className="text-xs text-slate-500 space-y-0.5">
                    <div className="flex justify-between">
                      <span>Input</span>
                      <span className="font-medium text-slate-700">{fmtNum(stats.promptTokens)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Output</span>
                      <span className="font-medium text-slate-700">{fmtNum(stats.completionTokens)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Cost</span>
                      <span className="font-medium text-emerald-600">{fmtCost(stats.cost)}</span>
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
