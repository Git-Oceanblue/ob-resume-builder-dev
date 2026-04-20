'use client';

import React, { useState, useEffect, forwardRef } from 'react';
import { Download, Printer, ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TEMPLATES, DEFAULT_TEMPLATE } from '@/templates';
import type { ResumeData } from '@/types/resume';

interface GeneratedResumeProps {
  resumeData: ResumeData;
  previewMode?: boolean;
  onGoToSave?: () => void;
}

const GeneratedResume = forwardRef<HTMLDivElement, GeneratedResumeProps>(
  ({ resumeData, previewMode = false, onGoToSave }, ref) => {
    const [isGenerating, setIsGenerating] = useState(false);

    const Template = TEMPLATES[DEFAULT_TEMPLATE];

    const handleDownload = async () => {
      if (!resumeData) return;
      setIsGenerating(true);
      try {
        await Template.buildDocx(resumeData);
      } catch {
        alert('Error generating Word document. Please try again.');
      } finally {
        setIsGenerating(false);
      }
    };

    const handlePrint = () => window.print();

    // Allow SaveStep to trigger download via custom event
    useEffect(() => {
      const handler = () => handleDownload();
      window.addEventListener('triggerResumeDownload', handler);
      return () => window.removeEventListener('triggerResumeDownload', handler);
    }); // eslint-disable-line react-hooks/exhaustive-deps

    return (
      <div ref={ref} className={previewMode ? 'flex flex-col h-full' : 'max-w-4xl mx-auto'}>

        {/* ── Action bar ── */}
        <div className={`sticky top-0 z-10 border-b border-gray-200 shadow-sm ${
          previewMode
            ? 'bg-gradient-to-r from-ocean-dark to-[#0b6cb5] px-5 py-2.5'
            : 'bg-white px-6 py-4'
        }`}>
          {previewMode ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#0b91c9] animate-pulse" />
                <span className="text-white text-sm font-semibold">Live Preview</span>
                <span className="text-blue-300 text-xs hidden sm:inline">— updates as you edit</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={handlePrint}
                  size="sm"
                  className="bg-white/10 hover:bg-white/20 text-white border border-white/20 h-8 text-xs"
                >
                  <Printer className="mr-1.5 w-3.5 h-3.5" /> Print
                </Button>
                <Button
                  onClick={handleDownload}
                  disabled={isGenerating}
                  size="sm"
                  className="bg-white/10 hover:bg-white/20 text-white border border-white/20 h-8 text-xs"
                >
                  {isGenerating ? <Loader2 className="mr-1.5 w-3.5 h-3.5 animate-spin" /> : <Download className="mr-1.5 w-3.5 h-3.5" />}
                  {isGenerating ? 'Generating…' : 'Download'}
                </Button>
                {onGoToSave && (
                  <Button
                    onClick={onGoToSave}
                    size="sm"
                    className="bg-white text-ocean-dark hover:bg-blue-50 h-8 text-xs font-bold shadow-md"
                  >
                    <ArrowRight className="mr-1.5 w-3.5 h-3.5" /> Save & Download
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-ocean-dark">Resume Preview</h2>
              <div className="flex gap-3">
                <Button onClick={handlePrint} variant="outline" size="sm"><Printer className="mr-2 w-4 h-4" /> Print</Button>
                <Button onClick={handleDownload} disabled={isGenerating} size="sm" variant="ocean">
                  {isGenerating ? <Loader2 className="mr-2 w-4 h-4 animate-spin" /> : <Download className="mr-2 w-4 h-4" />}
                  {isGenerating ? 'Generating…' : 'Download DOCX'}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* ── Template preview ── */}
        <div className={previewMode
          ? 'mx-4 my-4 rounded-xl shadow-md border border-gray-200 overflow-hidden bg-white'
          : 'border-2 border-gray-200 rounded-2xl shadow-xl mt-4 overflow-hidden bg-white'
        }>
          <Template.Preview resumeData={resumeData} />
        </div>
      </div>
    );
  }
);

GeneratedResume.displayName = 'GeneratedResume';

export default GeneratedResume;
