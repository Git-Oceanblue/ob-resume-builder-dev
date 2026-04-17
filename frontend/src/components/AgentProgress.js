import React from 'react';

const AGENT_META = {
  preprocessor:   { label: 'File Preprocessor',       icon: '🔍', color: 'indigo' },
  header:         { label: 'Header Agent',             icon: '👤', color: 'blue'   },
  summary:        { label: 'Summary Agent',            icon: '📝', color: 'cyan'   },
  experience:     { label: 'Experience Agent',         icon: '💼', color: 'violet' },
  education:      { label: 'Education Agent',          icon: '🎓', color: 'emerald'},
  skills:         { label: 'Skills Agent',             icon: '⚙️', color: 'orange' },
  certifications: { label: 'Certifications Agent',     icon: '🏆', color: 'yellow' },
  validator:      { label: 'Validator & Normalizer',   icon: '✅', color: 'green'  },
};

const PIPELINE_ORDER = [
  'preprocessor','header','summary','experience',
  'education','skills','certifications','validator',
];

const fmtTokens = (n) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n ?? 0);

const StatusDot = ({ status }) => {
  if (status === 'complete') {
    return (
      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-green-100 text-green-600 text-base flex-shrink-0">✓</span>
    );
  }
  if (status === 'running') {
    return (
      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-100 flex-shrink-0">
        <svg className="w-4 h-4 text-blue-500 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-red-100 text-red-500 text-base flex-shrink-0">✗</span>
    );
  }
  // pending
  return (
    <span className="flex items-center justify-center w-7 h-7 rounded-full bg-gray-100 flex-shrink-0">
      <span className="w-2.5 h-2.5 rounded-full bg-gray-300" />
    </span>
  );
};

export default function AgentProgress({ agentStatuses, fromCache }) {
  if (fromCache) {
    return (
      <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-6 text-center">
        <div className="text-4xl mb-3">⚡</div>
        <p className="text-emerald-700 font-semibold text-lg">Instant Result from Cache</p>
        <p className="text-emerald-600 text-sm mt-1">Resume was previously processed — returned from DynamoDB cache.</p>
      </div>
    );
  }

  const agents = PIPELINE_ORDER.map((id) => {
    const meta   = AGENT_META[id] || { label: id, icon: '🤖', color: 'gray' };
    const status = agentStatuses[id] || 'pending';
    const info   = typeof agentStatuses[id] === 'object' ? agentStatuses[id] : null;
    return { id, meta, status: info ? info.status : status, info };
  });

  const completedCount = agents.filter(a => a.status === 'complete').length;
  const progress = Math.round((completedCount / agents.length) * 100);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#002945] to-[#0b6cb5] px-6 py-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-white font-bold text-base">AI Agent Pipeline</h3>
            <p className="text-blue-200 text-xs mt-0.5">Multi-agent resume extraction in progress</p>
          </div>
          <span className="text-white font-mono text-sm bg-white/10 px-3 py-1 rounded-full">
            {completedCount}/{agents.length}
          </span>
        </div>
        {/* Progress bar */}
        <div className="w-full bg-white/20 rounded-full h-1.5">
          <div
            className="h-1.5 rounded-full bg-white transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Agent list */}
      <div className="divide-y divide-gray-50">
        {agents.map(({ id, meta, status, info }) => (
          <div
            key={id}
            className={`flex items-center gap-3 px-5 py-3 transition-colors ${
              status === 'running' ? 'bg-blue-50/60' :
              status === 'complete' ? 'bg-green-50/30' :
              status === 'error'   ? 'bg-red-50/30' : ''
            }`}
          >
            <StatusDot status={status} />
            <span className="text-lg flex-shrink-0 w-7 text-center">{meta.icon}</span>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium truncate ${
                status === 'pending' ? 'text-gray-400' : 'text-gray-800'
              }`}>
                {meta.label}
              </p>
              {status === 'running' && info?.desc && (
                <p className="text-xs text-blue-500 truncate">{info.desc}</p>
              )}
              {status === 'complete' && info?.tokenStats && (
                <p className="text-xs text-gray-400">
                  {fmtTokens(info.tokenStats.promptTokens)} in · {fmtTokens(info.tokenStats.completionTokens)} out
                  {info.processingTime ? ` · ${info.processingTime.toFixed(1)}s` : ''}
                </p>
              )}
            </div>
            {status === 'complete' && info?.tokenStats && (
              <span className="text-xs font-medium text-emerald-600 flex-shrink-0 bg-emerald-50 px-2 py-0.5 rounded-full">
                ${(info.tokenStats.cost || 0).toFixed(5)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
