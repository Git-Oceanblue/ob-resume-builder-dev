import React, { useState, useCallback } from 'react';
import FileUpload from './components/FileUpload';
import ResumeForm from './components/ResumeForm';
import GeneratedResume from './components/GeneratedResume';

function App() {
  const [step, setStep] = useState(1);
  const [resumeData, setResumeData] = useState(null);
  const [liveData, setLiveData] = useState(null);

  const handleResumeDataExtracted = (data) => {
    setResumeData(data);
    setLiveData(data);
    setStep(2);
  };

  const handleFormChange = useCallback((data) => {
    setLiveData(data);
  }, []);

  const handleFormSubmit = (data) => {
    setResumeData(data);
    setLiveData(data);
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* ── Header ── */}
      <header className="flex-shrink-0 bg-gradient-to-r from-ocean-dark via-[#0a4a8a] to-[#0b6cb5] shadow-2xl z-20">
        <div className="px-6 py-3">
          <div className="flex items-center justify-between">

            {/* Logo + brand */}
            <div className="flex items-center space-x-3">
              <div className="bg-white/10 backdrop-blur-sm p-1.5 rounded-xl border border-white/20 shadow-lg">
                <img
                  src="/logo.png"
                  alt="OceanBlue Solutions"
                  className="h-9 w-9 rounded-lg object-cover"
                />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white tracking-tight leading-tight">
                  OceanBlue Solutions
                </h1>
                <p className="text-ocean-blue text-[10px] font-semibold tracking-[0.2em] uppercase opacity-90">
                  Resume Automation Tool
                </p>
              </div>
            </div>

            {/* Step progress */}
            <div className="flex items-center space-x-1">
              <button
                onClick={() => setStep(1)}
                className={`flex items-center space-x-2 px-4 py-1.5 rounded-full text-sm font-semibold transition-all duration-300 ${
                  step === 1
                    ? 'bg-white text-ocean-dark shadow-md'
                    : 'bg-white/10 text-blue-200 hover:bg-white/20 border border-white/20'
                }`}
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                  step === 1 ? 'bg-ocean-dark text-white' : 'bg-white/20 text-white'
                }`}>1</span>
                <span>Upload</span>
              </button>

              <div className="flex items-center space-x-0.5 px-1">
                <div className={`h-px w-3 transition-all ${step >= 2 ? 'bg-white' : 'bg-white/20'}`} />
                <div className={`w-1.5 h-1.5 rounded-full transition-all ${step >= 2 ? 'bg-white' : 'bg-white/20'}`} />
                <div className={`h-px w-3 transition-all ${step >= 2 ? 'bg-white' : 'bg-white/20'}`} />
              </div>

              <div className={`flex items-center space-x-2 px-4 py-1.5 rounded-full text-sm font-semibold transition-all duration-300 border ${
                step === 2
                  ? 'bg-white text-ocean-dark shadow-md border-white'
                  : resumeData
                    ? 'bg-white/10 text-blue-200 hover:bg-white/20 border-white/20 cursor-pointer'
                    : 'bg-white/5 text-white/30 border-white/10 cursor-not-allowed'
              }`}
                onClick={() => resumeData && setStep(2)}
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                  step === 2 ? 'bg-ocean-dark text-white' : 'bg-white/20 text-white'
                }`}>2</span>
                <span>Edit &amp; Preview</span>
              </div>
            </div>

          </div>
        </div>
      </header>

      {/* ── Main content ── */}
      <main className="flex-1 overflow-hidden bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/40">

        {/* ─── STEP 1: Upload ─────────────────────────────────── */}
        {step === 1 && (
          <div className="h-full overflow-y-auto">
            <div className="container mx-auto px-6 py-10 max-w-5xl">

              {/* Hero */}
              <div className="text-center mb-10 animate-fade-in">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-ocean-dark to-ocean-blue rounded-2xl shadow-xl mb-5 ring-4 ring-ocean-blue/20">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h2 className="text-4xl font-extrabold text-ocean-dark mb-3 tracking-tight">
                  Resume Automation
                </h2>
                <p className="text-lg text-gray-500 max-w-xl mx-auto leading-relaxed">
                  Upload your resume — AI extracts every detail and lets you edit alongside a live preview
                </p>
              </div>

              {/* Feature cards */}
              <div className="grid grid-cols-3 gap-5 mb-10 animate-slide-up">
                {[
                  {
                    icon: '🤖',
                    title: 'AI Extraction',
                    desc: 'Multi-agent AI parses every section with high accuracy',
                    gradient: 'from-blue-500 to-cyan-400',
                    ring: 'ring-blue-100',
                  },
                  {
                    icon: '✏️',
                    title: 'Live Editing',
                    desc: 'Edit your resume alongside a real-time visual preview',
                    gradient: 'from-indigo-500 to-purple-400',
                    ring: 'ring-indigo-100',
                  },
                  {
                    icon: '📄',
                    title: 'Word Export',
                    desc: 'Download a polished, formatted .docx in one click',
                    gradient: 'from-emerald-500 to-teal-400',
                    ring: 'ring-emerald-100',
                  },
                ].map((f, i) => (
                  <div
                    key={i}
                    className="bg-white rounded-2xl p-6 shadow-md border border-gray-100 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 text-center group cursor-default"
                  >
                    <div className={`inline-flex items-center justify-center w-12 h-12 bg-gradient-to-br ${f.gradient} rounded-xl shadow-md mb-4 text-2xl ring-4 ${f.ring} group-hover:scale-110 transition-transform duration-300`}>
                      {f.icon}
                    </div>
                    <h3 className="font-bold text-ocean-dark mb-1 text-base">{f.title}</h3>
                    <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
                  </div>
                ))}
              </div>

              {/* Supported formats banner */}
              <div className="flex items-center justify-center space-x-3 mb-8">
                <span className="text-xs text-gray-400 font-medium uppercase tracking-wider">Supported formats</span>
                {['PDF', 'DOCX', 'TXT'].map(fmt => (
                  <span key={fmt} className="px-3 py-1 bg-white border border-gray-200 text-gray-600 rounded-full text-xs font-semibold shadow-sm">
                    {fmt}
                  </span>
                ))}
              </div>

              {/* Upload card */}
              <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden p-8">
                <FileUpload
                  onResumeDataExtracted={handleResumeDataExtracted}
                  setLoading={() => {}}
                />
              </div>

              {/* Footer note */}
              <p className="text-center text-xs text-gray-400 mt-6">
                Your data is processed securely and never stored permanently.
              </p>
            </div>
          </div>
        )}

        {/* ─── STEP 2: Edit & Preview split ──────────────────── */}
        {step === 2 && liveData && (
          <div className="flex h-full animate-fade-in">

            {/* Left panel — Form editor */}
            <div
              className="w-[52%] h-full overflow-y-auto border-r border-gray-200 bg-white"
              style={{ scrollbarWidth: 'thin', scrollbarColor: '#0b91c9 #f1f5f9' }}
            >
              <ResumeForm
                initialData={resumeData}
                onSubmit={handleFormSubmit}
                onChange={handleFormChange}
                onBack={() => setStep(1)}
              />
            </div>

            {/* Right panel — Live preview */}
            <div
              className="w-[48%] h-full overflow-y-auto bg-slate-50"
              style={{ scrollbarWidth: 'thin', scrollbarColor: '#0b91c9 #f1f5f9' }}
            >
              <GeneratedResume resumeData={liveData} previewMode={true} />
            </div>

          </div>
        )}

      </main>
    </div>
  );
}

export default App;
