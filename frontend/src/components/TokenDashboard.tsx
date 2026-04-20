'use client';

// TokenDashboard is now integrated inline into GeneratedResume.
// This file is kept for any external usage but the component is no longer rendered separately.

import React from 'react';
import type { TokenStats } from '@/types/resume';

export default function TokenDashboard({ tokenStats }: { tokenStats: TokenStats }) {
  if (!tokenStats) return null;
  const fmt  = (n: number) => Number(n || 0).toLocaleString();
  const cost = (n: number) => `$${Number(n || 0).toFixed(5)}`;
  return (
    <div className="flex items-center gap-3 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5">
      <span className="font-semibold text-slate-700">{fmt(tokenStats.totalTokens)}</span> tokens
      <span className="text-slate-300">|</span>
      <span className="font-semibold text-emerald-600">{cost(tokenStats.cost)}</span>
    </div>
  );
}
