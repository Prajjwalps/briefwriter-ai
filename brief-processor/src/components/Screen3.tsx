import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, ArrowRight, Loader2, AlertCircle, RefreshCw, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EnhancedOutline, Screen3Data } from '@/types';

interface Screen3Props {
  data: Screen3Data;
  onBack: () => void;
  onContinue: (editedOutlineText: string, tone: string) => void;
}

const TONE_OPTIONS = [
  { value: 'Academic',      label: 'Academic',      desc: 'Formal scholarly style' },
  { value: 'Formal',        label: 'Formal',        desc: 'Professional and structured' },
  { value: 'Analytical',    label: 'Analytical',    desc: 'Evidence-based reasoning' },
  { value: 'Critical',      label: 'Critical',      desc: 'Evaluative and questioning' },
  { value: 'Argumentative', label: 'Argumentative', desc: 'Persuasive with clear thesis' },
  { value: 'Reflective',    label: 'Reflective',    desc: 'Personal and introspective' },
  { value: 'Descriptive',   label: 'Descriptive',   desc: 'Detailed and explanatory' },
  { value: 'Technical',     label: 'Technical',     desc: 'Precise and domain-specific' },
];

const PROGRESS_LABELS = [
  'Analysing your outline…',
  'Integrating references…',
  'Applying your instructions…',
  'Finalising structure…',
];

export default function Screen3({ data, onBack, onContinue }: Screen3Props) {
  const [outlineText, setOutlineText]         = useState('');
  const [isEnhancing, setIsEnhancing]         = useState(true);
  const [extraInstructions, setExtraInstructions] = useState('');
  const [tone, setTone]                       = useState('Academic');
  const [error, setError]                     = useState<string | null>(null);
  const [progress, setProgress]               = useState(0);
  const [progressLabel, setProgressLabel]     = useState('');
  const timerRef                              = useRef<ReturnType<typeof setInterval> | null>(null);

  const context = data?.briefContext;
  const selectedReferences = data?.selectedReferences || [];

  const startProgress = () => {
    setProgress(5);
    setProgressLabel(PROGRESS_LABELS[0]);
    let labelIdx = 0;
    timerRef.current = setInterval(() => {
      setProgress(p => {
        if (p >= 88) return p;
        const next = p + Math.random() * 7;
        // Cycle through labels as progress advances
        const newLabelIdx = Math.min(Math.floor((next / 90) * PROGRESS_LABELS.length), PROGRESS_LABELS.length - 1);
        if (newLabelIdx !== labelIdx) {
          labelIdx = newLabelIdx;
          setProgressLabel(PROGRESS_LABELS[labelIdx]);
        }
        return next;
      });
    }, 700);
  };

  const finishProgress = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setProgress(100);
    setProgressLabel('Done');
    setTimeout(() => setProgress(0), 1200);
  };

  const loadEnhancedOutline = async (instructions: string) => {
    setIsEnhancing(true);
    setError(null);
    startProgress();

    try {
      // Defensive check: ensure context and selectedReferences are valid
      if (!context || !context.outline || selectedReferences.length === 0) {
        throw new Error('Missing required brief context or references');
      }

      const response = await fetch('/api/enhance-outline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          briefContext: context,
          selectedReferences: selectedReferences,
          extraInstructions: instructions,
          currentOutlineText: outlineText || '',   // send user's edited outline as base
          tone: tone || 'Academic',
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(err.error ?? `Server error ${response.status}`);
      }

      const outline: any = await response.json();

      // Simple format: outline string contains the condensed outline
      const generatedText = outline.outline || '';

      if (!generatedText.trim()) {
        throw new Error('No outline text in response');
      }

      setOutlineText(generatedText);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to generate outline';
      setError(msg);
      console.error('[Screen3] Error:', msg);
    } finally {
      finishProgress();
      setIsEnhancing(false);
    }
  };

  const handleRegenerateClick = () => {
    if (extraInstructions.trim() || tone) {
      loadEnhancedOutline(extraInstructions);
    }
  };

  const handleContinue = () => {
    if (outlineText.trim()) {
      onContinue(outlineText, tone);
    }
  };

  useEffect(() => {
    loadEnhancedOutline('');
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  // Validation
  if (!context.outline || selectedReferences.length === 0) {
    return (
      <div className="min-h-screen bg-[#F7F6F3] flex flex-col">
        <header className="border-b border-gray-200 bg-white px-6 py-4 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-gray-900 tracking-tight">BriefWriter AI</h1>
              <p className="text-[10px] text-gray-400 tracking-widest uppercase">Academic Writing Assistant</p>
            </div>
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="bg-red-50 border border-red-200 rounded-xl p-8 max-w-md">
            <AlertCircle className="w-8 h-8 text-red-600 mb-3" />
            <p className="text-sm text-red-700 font-semibold">Missing Data</p>
            <p className="text-xs text-red-600 mt-2">
              {!context.outline ? 'Outline is missing' : 'References are missing'}
            </p>
            <button onClick={onBack} className="mt-4 text-sm text-red-700 hover:text-red-900 underline">
              Go Back
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F6F3] flex flex-col">

      {/* Branding Header */}
      <header className="border-b border-gray-200 bg-white px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-gray-900 tracking-tight">BriefWriter AI</h1>
            <p className="text-[10px] text-gray-400 tracking-widest uppercase">Academic Writing Assistant</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4].map(step => (
            <div key={step} className="flex items-center gap-1">
              <div className={cn(
                'w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-all',
                step < 3  ? 'bg-emerald-500 text-white' :
                step === 3 ? 'bg-slate-900 text-white' :
                'bg-gray-200 text-gray-400'
              )}>
                {step < 3 ? '✓' : step}
              </div>
              {step < 4 && <div className={cn('w-6 h-px', step < 3 ? 'bg-emerald-400' : 'bg-gray-200')} />}
            </div>
          ))}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Step 3 of 4</p>
          <h1 className="text-3xl font-bold text-gray-900">Final Outline</h1>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-700">Error generating outline</p>
                <p className="text-xs text-red-600 mt-1">{error}</p>
                <button
                  onClick={() => loadEnhancedOutline('')}
                  className="mt-3 px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded hover:bg-red-700"
                >
                  Try Again
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Progress Bar */}
        {progress > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-6">
            <div className="flex justify-between text-xs text-gray-500 mb-2">
              <span>{progressLabel}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-0.5">
              <div
                className="h-0.5 bg-slate-900 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Loading State (spinner only when no outline yet) */}
        {isEnhancing && !outlineText && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-slate-900 mr-2" />
            <span className="text-gray-600">Generating your enhanced outline…</span>
          </div>
        )}

        {(!isEnhancing || outlineText) && (
          <>
            {/* Outline Text Editor */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
              <label className="block text-sm font-semibold text-gray-900 mb-3">
                Your Outline
              </label>
              <textarea
                value={outlineText}
                onChange={(e) => setOutlineText(e.target.value)}
                className={cn(
                  'w-full rounded-xl border border-gray-200 text-sm text-gray-800 px-4 py-3 resize-none',
                  'placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-400',
                  'min-h-[500px] font-mono'
                )}
                placeholder="Your outline will appear here..."
              />
              <p className="text-xs text-gray-500 mt-2">
                Word count: {outlineText.split(/\s+/).filter(w => w).length} words
              </p>
            </div>

            {/* Tone Selector */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
              <label className="block text-sm font-semibold text-gray-900 mb-1">
                Writing Tone
              </label>
              <p className="text-xs text-gray-500 mb-4">Select the tone for the outline and generated document</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {TONE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setTone(opt.value)}
                    className={cn(
                      'flex flex-col items-start px-3 py-2.5 rounded-lg border text-left transition-all text-sm',
                      tone === opt.value
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'
                    )}
                  >
                    <span className="font-semibold text-xs">{opt.label}</span>
                    <span className={cn('text-[10px] mt-0.5', tone === opt.value ? 'text-gray-300' : 'text-gray-400')}>
                      {opt.desc}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Regenerate Section */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
              <label className="block text-sm font-semibold text-gray-900 mb-1">
                <RefreshCw className="w-4 h-4 inline mr-2" />
                Regenerate with Instructions
              </label>
              <p className="text-xs text-gray-500 mb-3">
                Your instructions will be treated as mandatory requirements. The current outline text is used as the base.
              </p>
              <textarea
                value={extraInstructions}
                onChange={(e) => setExtraInstructions(e.target.value)}
                placeholder="E.g. 'Add a section on ethical implications', 'Make the methodology section more detailed', 'Focus on quantitative evidence only'"
                className={cn(
                  'w-full rounded-xl border border-gray-200 text-sm text-gray-800 px-4 py-3 resize-none',
                  'placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-400',
                  'min-h-[100px]'
                )}
              />
              <button
                onClick={handleRegenerateClick}
                disabled={isEnhancing}
                className={cn(
                  'mt-3 px-4 py-2 rounded-lg text-sm font-semibold transition-all',
                  !isEnhancing
                    ? 'bg-slate-900 text-white hover:bg-slate-800'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                )}
              >
                {isEnhancing ? 'Regenerating…' : 'Regenerate Outline'}
              </button>
            </div>

            {/* Navigation */}
            <div className="flex gap-3">
              <button
                onClick={onBack}
                className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl border border-gray-200 text-gray-900 font-semibold hover:bg-gray-100"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to References
              </button>
              <button
                onClick={handleContinue}
                disabled={!outlineText.trim()}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all',
                  outlineText.trim()
                    ? 'bg-slate-900 text-white hover:bg-slate-800 shadow-sm hover:shadow-md'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                )}
              >
                Continue to Draft <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </>
        )}
      </div>
      </main>
    </div>
  );
}
