'use client';

import React, { useState } from 'react';
import { Download, Printer, ArrowRight, Loader2, BarChart2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TEMPLATES, DEFAULT_TEMPLATE } from '@/templates';
import type { ResumeData, TokenStats } from '@/types/resume';

interface Props {
  resumeData: ResumeData;
  previewMode?: boolean;
  onGoToSave?: () => void;
  onDownload?: () => Promise<void>;
  tokenStats?: TokenStats;
}

export default function GeneratedResume({ resumeData, previewMode = false, onGoToSave, onDownload, tokenStats }: Props) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [showTokens, setShowTokens]     = useState(false);

  const Template = TEMPLATES[DEFAULT_TEMPLATE];

  const handleDownload = async () => {
    setIsGenerating(true);
    try {
      if (onDownload) {
        await onDownload();
      } else {
        await Template.buildDocx(resumeData);
      }
    } catch {
      alert('Error generating document. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const stats = tokenStats ?? resumeData?.tokenStats;

  return (
    <div className={previewMode ? 'flex flex-col h-full' : 'max-w-4xl mx-auto'}>

      {/* Action bar */}
      <div className={`sticky top-0 z-10 border-b shadow-sm ${
        previewMode
          ? 'bg-gradient-to-r from-ocean-dark to-[#0a4a8a] border-slate-700 px-4 py-2.5'
          : 'bg-white border-slate-200 px-6 py-4'
      }`}>
        {previewMode ? (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full bg-[#0b91c9] animate-pulse flex-shrink-0" />
              <span className="text-white text-xs font-semibold">Live Preview</span>
              {stats && (
                <button
                  onClick={() => setShowTokens(v => !v)}
                  className="hidden sm:flex items-center gap-1 text-slate-300 hover:text-white text-[11px] ml-1 transition-colors"
                >
                  <BarChart2 className="w-3 h-3" />
                  ${(stats.cost || 0).toFixed(4)} · {showTokens ? 'hide' : 'stats'}
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={() => window.print()}
                className="text-slate-300 hover:text-white text-xs px-2.5 py-1.5 rounded-lg border border-white/20 hover:bg-white/10 transition-colors"
              >
                <Printer className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleDownload}
                disabled={isGenerating}
                className="flex items-center gap-1.5 text-slate-300 hover:text-white text-xs px-3 py-1.5 rounded-lg border border-white/20 hover:bg-white/10 transition-colors disabled:opacity-50"
              >
                {isGenerating
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Download className="w-3.5 h-3.5" />
                }
                <span className="hidden sm:inline">{isGenerating ? 'Generating…' : 'DOCX'}</span>
              </button>
              {onGoToSave && (
                <button
                  onClick={onGoToSave}
                  className="flex items-center gap-1.5 bg-white text-ocean-dark text-xs font-bold px-3 py-1.5 rounded-lg shadow hover:bg-slate-100 transition-colors"
                >
                  Export <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-ocean-dark">Resume Preview</h2>
            <div className="flex gap-2">
              <Button onClick={() => window.print()} variant="outline" size="sm">
                <Printer className="mr-1.5 w-3.5 h-3.5" /> Print
              </Button>
              <Button onClick={handleDownload} disabled={isGenerating} size="sm" className="bg-ocean-dark hover:bg-[#013a63] text-white">
                {isGenerating ? <Loader2 className="mr-1.5 w-3.5 h-3.5 animate-spin" /> : <Download className="mr-1.5 w-3.5 h-3.5" />}
                {isGenerating ? 'Generating…' : 'Download DOCX'}
              </Button>
            </div>
          </div>
        )}

        {/* Token stats strip */}
        {previewMode && showTokens && stats && (
          <div className="mt-2 pt-2 border-t border-white/10 flex flex-wrap items-center gap-4 text-[11px] text-slate-300">
            <span><span className="text-white font-semibold">{stats.promptTokens?.toLocaleString()}</span> input</span>
            <span><span className="text-white font-semibold">{stats.completionTokens?.toLocaleString()}</span> output</span>
            <span><span className="text-emerald-400 font-semibold">${(stats.cost || 0).toFixed(5)}</span> total cost</span>
          </div>
        )}
      </div>

      {/* Template preview */}
      <div className={previewMode
        ? 'mx-4 my-4 rounded-xl shadow-md border border-slate-200 overflow-hidden bg-white'
        : 'mt-4 rounded-2xl border-2 border-slate-200 shadow-xl overflow-hidden bg-white'
      }>
        <Template.Preview resumeData={resumeData} />
      </div>
    </div>
  );
}
