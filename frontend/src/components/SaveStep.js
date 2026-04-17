import React, { useState, useEffect } from 'react';
import { FiDownload, FiCloud, FiCheck, FiList, FiExternalLink } from 'react-icons/fi';

const API_BASE = (process.env.REACT_APP_API_URL || '').replace(/\/$/, '');

const US_STATES = [
  '', 'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut',
  'Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa',
  'Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan',
  'Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada',
  'New Hampshire','New Jersey','New Mexico','New York','North Carolina',
  'North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island',
  'South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont',
  'Virginia','Washington','West Virginia','Wisconsin','Wyoming',
];

export default function SaveStep({ resumeData, onDownload, onBack }) {
  const [targetState, setTargetState]   = useState('');
  const [saving, setSaving]             = useState(false);
  const [saved, setSaved]               = useState(null);
  const [savedList, setSavedList]       = useState([]);
  const [listLoading, setListLoading]   = useState(false);
  const [awsEnabled, setAwsEnabled]     = useState(false);
  const [error, setError]               = useState('');

  const candidateName = resumeData?.name || 'Resume';

  // Check if AWS is available and load saved list
  useEffect(() => {
    const checkAws = async () => {
      try {
        setListLoading(true);
        const res  = await fetch(`${API_BASE}/api/resumes`);
        const data = await res.json();
        setAwsEnabled(data.awsEnabled ?? false);
        setSavedList(data.resumes || []);
      } catch {
        setAwsEnabled(false);
      } finally {
        setListLoading(false);
      }
    };
    checkAws();
  }, []);

  const handleSaveToS3 = async () => {
    setSaving(true);
    setError('');
    try {
      const res  = await fetch(`${API_BASE}/api/save-resume`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ resumeData, targetState }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSaved(data);
      // Refresh list
      const listRes  = await fetch(`${API_BASE}/api/resumes`);
      const listData = await listRes.json();
      setSavedList(listData.resumes || []);
    } catch (err) {
      setError(`Save failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/40">
      <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">

        {/* Candidate banner */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#002945] to-[#0b6cb5] flex items-center justify-center text-white font-bold text-xl flex-shrink-0">
            {candidateName.charAt(0)}
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold">Ready to Export</p>
            <h2 className="text-xl font-bold text-gray-800">{candidateName}</h2>
            <p className="text-sm text-gray-500">{resumeData?.title || 'Resume'}</p>
          </div>
        </div>

        {/* State selector */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-5">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Target State <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <select
            value={targetState}
            onChange={(e) => setTargetState(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-ocean-blue/30 bg-gray-50"
          >
            <option value="">— Select a US state —</option>
            {US_STATES.filter(Boolean).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <p className="text-xs text-gray-400 mt-1.5">Used as metadata when saving to S3.</p>
        </div>

        {/* Action cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* Download locally */}
          <button
            onClick={onDownload}
            className="group bg-white hover:bg-gradient-to-br hover:from-[#002945] hover:to-[#0b6cb5] border border-gray-200 hover:border-transparent rounded-2xl p-6 text-left transition-all duration-300 shadow-sm hover:shadow-lg"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-50 group-hover:bg-white/20 flex items-center justify-center mb-4 transition-colors">
              <FiDownload className="w-5 h-5 text-ocean-blue group-hover:text-white" />
            </div>
            <h3 className="font-bold text-gray-800 group-hover:text-white text-base">Download DOCX</h3>
            <p className="text-sm text-gray-500 group-hover:text-blue-100 mt-1">
              Save to your local computer as a Word document.
            </p>
          </button>

          {/* Save to S3 */}
          <div className={`rounded-2xl border p-6 shadow-sm ${awsEnabled ? 'bg-white border-gray-200' : 'bg-gray-50 border-dashed border-gray-200 opacity-60'}`}>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center mb-4">
              {saved ? <FiCheck className="w-5 h-5 text-emerald-600" /> : <FiCloud className="w-5 h-5 text-emerald-600" />}
            </div>
            <h3 className="font-bold text-gray-800 text-base">
              {saved ? 'Saved to S3 ✓' : 'Save to AWS S3'}
            </h3>
            <p className="text-sm text-gray-500 mt-1 mb-4">
              {!awsEnabled
                ? 'AWS S3 not configured. Set RESUMES_S3_BUCKET env var to enable.'
                : saved
                  ? `Saved! Key: ${saved.key?.split('/').pop()}`
                  : 'Store permanently in your AWS S3 bucket.'}
            </p>

            {awsEnabled && !saved && (
              <button
                onClick={handleSaveToS3}
                disabled={saving}
                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Saving…
                  </>
                ) : (
                  <><FiCloud className="w-4 h-4" /> Save to S3</>
                )}
              </button>
            )}

            {saved?.downloadUrl && (
              <a
                href={saved.downloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 flex items-center justify-center gap-1.5 text-xs text-ocean-blue hover:underline"
              >
                <FiExternalLink className="w-3.5 h-3.5" /> Presigned download link
              </a>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {/* Saved resumes list */}
        {awsEnabled && savedList.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50 flex items-center gap-2">
              <FiList className="w-4 h-4 text-ocean-blue" />
              <span className="font-semibold text-gray-700 text-sm">Previously Saved Resumes</span>
              <span className="ml-auto text-xs text-gray-400">{savedList.length} files</span>
            </div>
            {listLoading ? (
              <div className="p-6 text-center text-sm text-gray-400">Loading…</div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {savedList.slice(0, 8).map((r) => (
                  <li key={r.key} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50">
                    <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                      <FiCloud className="w-3.5 h-3.5 text-ocean-blue" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-700 truncate">{r.candidateName}</p>
                      <p className="text-xs text-gray-400 truncate">
                        {new Date(r.lastModified).toLocaleString()} · {(r.sizeBytes / 1024).toFixed(1)} KB
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Back button */}
        <button
          onClick={onBack}
          className="text-sm text-gray-400 hover:text-gray-600 flex items-center gap-1.5 transition-colors"
        >
          ← Back to Edit & Preview
        </button>

      </div>
    </div>
  );
}
