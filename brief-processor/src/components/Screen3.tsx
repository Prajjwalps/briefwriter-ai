import { useState, useEffect } from 'react';
import { ArrowLeft, ArrowRight, Loader2, AlertCircle, RefreshCw, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EnhancedOutline, Screen3Data } from '@/types';

interface Screen3Props {
  data: Screen3Data;
  onBack: () => void;
  onContinue: (editedOutlineText: string) => void;
}

export default function Screen3({ data, onBack, onContinue }: Screen3Props) {
  const [outlineText, setOutlineText] = useState('');
  const [isEnhancing, setIsEnhancing] = useState(true);
  const [showRegenerate, setShowRegenerate] = useState(false);
  const [extraInstructions, setExtraInstructions] = useState('');
  const [error, setError] = useState<string | null>(null);

  const context = data.briefContext;
  const selectedReferences = data.selectedReferences;

  // Mount effect - load enhanced outline
  useEffect(() => {
    loadEnhancedOutline('');
  }, []);

  const loadEnhancedOutline = async (instructions: string) => {
    setIsEnhancing(true);
    setError(null);

    try {
      const response = await fetch('/api/enhance-outline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          briefContext: context,
          selectedReferences,
          extraInstructions: instructions,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(err.error ?? `Server error ${response.status}`);
      }

      const outline: EnhancedOutline = await response.json();

      // Convert outline to readable text format
      let text = '';
      outline.sections.forEach((section, idx) => {
        text += `${idx + 1}. ${section.section} (${section.wordCount} words)\n`;
        text += `   Points: ${section.points.join(', ')}\n`;
        text += `   Description: ${section.description}\n`;
        if (section.referenceMappings?.guidance) {
          text += `   Reference Guidance: ${section.referenceMappings.guidance}\n`;
        }
        text += '\n';
      });

      if (outline.overallGuidance) {
        text += `Overall Guidance:\n${outline.overallGuidance}\n`;
      }

      setOutlineText(text);
      setShowRegenerate(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to generate outline';
      setError(msg);
      console.error('[Screen3] Error:', msg);
    } finally {
      setIsEnhancing(false);
    }
  };

  const handleRegenerateClick = () => {
    if (extraInstructions.trim()) {
      loadEnhancedOutline(extraInstructions);
    }
  };

  const handleContinue = () => {
    if (outlineText.trim()) {
      onContinue(outlineText);
    }
  };

  // Validation
  if (!context.outline || selectedReferences.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="bg-red-50 border border-red-200 rounded-xl p-8 max-w-md">
          <AlertCircle className="w-8 h-8 text-red-600 mb-3" />
          <p className="text-sm text-red-700 font-semibold">Missing Data</p>
          <p className="text-xs text-red-600 mt-2">
            {!context.outline ? 'Outline is missing' : 'References are missing'}
          </p>
          <button
            onClick={onBack}
            className="mt-4 text-sm text-red-700 hover:text-red-900 underline"
          >
            Go Back
          </button>
        </div>
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

        {/* Loading State */}
        {isEnhancing ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-slate-900 mr-2" />
            <span className="text-gray-600">Generating your enhanced outline…</span>
          </div>
        ) : (
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

            {/* Regenerate Section */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
              <label className="block text-sm font-semibold text-gray-900 mb-3">
                <RefreshCw className="w-4 h-4 inline mr-2" />
                Regenerate with Special Instructions (optional)
              </label>
              <textarea
                value={extraInstructions}
                onChange={(e) => setExtraInstructions(e.target.value)}
                placeholder="E.g., 'Focus more on recent research' or 'Add more practical examples'"
                className={cn(
                  'w-full rounded-xl border border-gray-200 text-sm text-gray-800 px-4 py-3 resize-none',
                  'placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-400',
                  'min-h-[100px]'
                )}
              />
              <button
                onClick={handleRegenerateClick}
                disabled={!extraInstructions.trim() || isEnhancing}
                className={cn(
                  'mt-3 px-4 py-2 rounded-lg text-sm font-semibold transition-all',
                  extraInstructions.trim() && !isEnhancing
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
