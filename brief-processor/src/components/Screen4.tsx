import { useState, useRef } from 'react';
import { ArrowLeft, Download, Loader2, FileText, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Screen3Data } from '@/types';

interface Screen4Props {
  data: Screen3Data & { outlineText: string; tone?: string };
  onBack: () => void;
  onComplete?: () => void;
}

const PROGRESS_LABELS = [
  'Drafting document…',
  'Expanding sections…',
  'Adding citations…',
  'Formatting references…',
  'Building DOCX…',
];

export default function Screen4({ data, onBack, onComplete }: Screen4Props) {
  const [isGenerating, setIsGenerating]         = useState(false);
  const [generatedDocument, setGeneratedDocument] = useState<string | null>(null);
  const [documentTitle, setDocumentTitle]       = useState('');
  const [error, setError]                       = useState<string | null>(null);
  const [progress, setProgress]                 = useState(0);
  const [progressLabel, setProgressLabel]       = useState('');
  const [formattingConfirmed, setFormattingConfirmed] = useState(false);
  const timerRef                                = useRef<ReturnType<typeof setInterval> | null>(null);

  const tone = (data as any).tone || 'Academic';

  const formatSettings = {
    font: 'Times New Roman',
    heading1Size: '14pt',
    heading1Bold: true,
    heading2Size: '12pt',
    heading2Bold: true,
    bodySize: '12pt',
    bodyJustified: true,
    referencesSection: true,
    referencesWithLinks: true,
  };

  const startProgress = () => {
    setProgress(5);
    setProgressLabel(PROGRESS_LABELS[0]);
    let labelIdx = 0;
    timerRef.current = setInterval(() => {
      setProgress(p => {
        if (p >= 88) return p;
        const next = p + Math.random() * 6;
        const newLabelIdx = Math.min(Math.floor((next / 90) * PROGRESS_LABELS.length), PROGRESS_LABELS.length - 1);
        if (newLabelIdx !== labelIdx) {
          labelIdx = newLabelIdx;
          setProgressLabel(PROGRESS_LABELS[labelIdx]);
        }
        return next;
      });
    }, 800);
  };

  const finishProgress = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setProgress(100);
    setProgressLabel('Done');
    setTimeout(() => setProgress(0), 1200);
  };

  const handleGenerateDocument = async () => {
    setIsGenerating(true);
    setError(null);
    startProgress();

    try {
      const response = await fetch('/api/generate-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outline: data.outlineText,
          references: data.selectedReferences,
          referenceStyle: data.briefContext.detectedReferenceStyle || 'APA 7',
          briefContext: data.briefContext,
          tone,
          formatSettings,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(err.error ?? `Server error ${response.status}`);
      }

      const result = await response.json();
      setGeneratedDocument(result.documentText);
      setDocumentTitle(result.title);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to generate document';
      setError(msg);
      console.error('[Screen4] Error:', msg);
    } finally {
      finishProgress();
      setIsGenerating(false);
    }
  };

  const handleDownloadDocx = async () => {
    if (!generatedDocument) return;

    try {
      const response = await fetch('/api/generate-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outline: data.outlineText,
          references: data.selectedReferences,
          referenceStyle: data.briefContext.detectedReferenceStyle || 'APA 7',
          briefContext: data.briefContext,
          tone,
        }),
      });

      if (!response.ok) throw new Error(`Server error: ${response.status}`);

      const result = await response.json();

      if (!result.docxBase64) {
        alert('Document generated but DOCX format not available. Using text format instead.');
        const element = document.createElement('a');
        const file = new Blob([generatedDocument], { type: 'text/plain' });
        element.href = URL.createObjectURL(file);
        element.download = `${data.briefContext.subject || 'document'}-${Date.now()}.txt`;
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
        return;
      }

      const binaryString = atob(result.docxBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const docxBlob = new Blob([bytes], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });

      const element = document.createElement('a');
      element.href = URL.createObjectURL(docxBlob);
      element.download = `${data.briefContext.subject || 'document'}-${Date.now()}.docx`;
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
      alert('Document downloaded! Open it in Microsoft Word or Google Docs.');
    } catch (err) {
      console.error('Download error:', err);
      alert('Failed to download DOCX document');
    }
  };

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
                step < 4  ? 'bg-emerald-500 text-white' :
                step === 4 ? 'bg-slate-900 text-white' :
                'bg-gray-200 text-gray-400'
              )}>
                {step < 4 ? '✓' : step}
              </div>
              {step < 4 && <div className={cn('w-6 h-px', step < 4 ? 'bg-emerald-400' : 'bg-gray-200')} />}
            </div>
          ))}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Step 4 of 4</p>
          <h1 className="text-3xl font-bold text-gray-900">Generate Document</h1>
          {tone && (
            <p className="text-xs text-gray-500 mt-1">
              Tone: <span className="font-semibold text-gray-700">{tone}</span>
            </p>
          )}
        </div>

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

        {/* Formatting Settings Card */}
        {!generatedDocument && !formattingConfirmed && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
            <h3 className="text-lg font-bold text-gray-900 mb-1">Document Formatting</h3>
            <p className="text-xs text-gray-500 mb-4">Your document will be formatted with these settings:</p>

            <div className="space-y-3 mb-6">
              <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                <div className="w-5 h-5 rounded bg-emerald-500 flex items-center justify-center mt-0.5 flex-shrink-0">
                  <span className="text-white text-[10px] font-bold">✓</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Font: Times New Roman</p>
                  <p className="text-xs text-gray-600">All text including headings and body</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                <div className="w-5 h-5 rounded bg-emerald-500 flex items-center justify-center mt-0.5 flex-shrink-0">
                  <span className="text-white text-[10px] font-bold">✓</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Heading 1: 14pt, Bold</p>
                  <p className="text-xs text-gray-600">Main section headings</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                <div className="w-5 h-5 rounded bg-emerald-500 flex items-center justify-center mt-0.5 flex-shrink-0">
                  <span className="text-white text-[10px] font-bold">✓</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Heading 2: 12pt, Bold</p>
                  <p className="text-xs text-gray-600">Sub-headings</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                <div className="w-5 h-5 rounded bg-emerald-500 flex items-center justify-center mt-0.5 flex-shrink-0">
                  <span className="text-white text-[10px] font-bold">✓</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Body Text: 12pt, Justified</p>
                  <p className="text-xs text-gray-600">Paragraphs aligned evenly on both margins</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                <div className="w-5 h-5 rounded bg-emerald-500 flex items-center justify-center mt-0.5 flex-shrink-0">
                  <span className="text-white text-[10px] font-bold">✓</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">References Section</p>
                  <p className="text-xs text-gray-600">Separate heading with each reference listed individually</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                <div className="w-5 h-5 rounded bg-emerald-500 flex items-center justify-center mt-0.5 flex-shrink-0">
                  <span className="text-white text-[10px] font-bold">✓</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Reference Links</p>
                  <p className="text-xs text-gray-600">URLs and DOIs included in proper {data.briefContext.detectedReferenceStyle || 'APA 7'} format</p>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setFormattingConfirmed(false)}
                className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 text-gray-900 font-semibold hover:bg-gray-100 text-sm"
              >
                Change Settings
              </button>
              <button
                onClick={() => setFormattingConfirmed(true)}
                className="flex-1 px-4 py-2.5 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 text-sm"
              >
                Confirm & Continue
              </button>
            </div>
          </div>
        )}

        {/* Document Generation Section */}
        {!generatedDocument && formattingConfirmed ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Generate Full Document</h3>
            <p className="text-sm text-gray-600 mb-6">
              Converts your finalised outline into a complete essay with proper citations, strictly following every section in the outline.
            </p>
            <button
              onClick={handleGenerateDocument}
              disabled={isGenerating}
              className={cn(
                'w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg text-sm font-semibold transition-all',
                isGenerating
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-slate-900 text-white hover:bg-slate-800 shadow-sm hover:shadow-md'
              )}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating Document…
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4" />
                  Generate Full Document
                </>
              )}
            </button>
            {error && (
              <p className="text-xs text-red-600 mt-3">{error}</p>
            )}
          </div>
        ) : !generatedDocument ? null : (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Generated Document</h3>
              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                {generatedDocument.split(/\s+/).filter(w => w).length} words
              </span>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 mb-4 max-h-[500px] overflow-y-auto border border-gray-200">
              <pre className="text-sm text-gray-800 whitespace-pre-wrap break-words font-sans leading-relaxed">
                {generatedDocument}
              </pre>
            </div>
            <button
              onClick={handleDownloadDocx}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-slate-900 text-white font-semibold hover:bg-slate-800 text-sm transition-all"
            >
              <Download className="w-4 h-4" />
              Download as DOCX
            </button>
          </div>
        )}

        {/* Navigation */}
        <div className="flex gap-3">
          <button
            onClick={onBack}
            className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl border border-gray-200 text-gray-900 font-semibold hover:bg-gray-100"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Edit
          </button>
          {onComplete && (
            <button
              onClick={onComplete}
              className="flex-1 py-3 px-4 rounded-lg bg-slate-900 text-white font-semibold hover:bg-slate-800 transition-all shadow-sm hover:shadow-md"
            >
              Complete
            </button>
          )}
        </div>
      </div>
      </main>
    </div>
  );
}
