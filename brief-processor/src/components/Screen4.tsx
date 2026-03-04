import { useState } from 'react';
import { ArrowLeft, Download, Loader2, FileText, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Screen3Data } from '@/types';

interface Screen4Props {
  data: Screen3Data & { outlineText: string };
  onBack: () => void;
  onComplete?: () => void;
}

export default function Screen4({ data, onBack, onComplete }: Screen4Props) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedDocument, setGeneratedDocument] = useState<string | null>(null);
  const [documentTitle, setDocumentTitle] = useState('');
  const [error, setError] = useState<string | null>(null);


  const handleGenerateDocument = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch('/api/generate-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outline: data.outlineText,
          references: data.selectedReferences,
          referenceStyle: data.briefContext.detectedReferenceStyle || 'APA 7',
          briefContext: data.briefContext,
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
      setIsGenerating(false);
    }
  };

  const handleDownloadDocx = async () => {
    if (!generatedDocument) return;

    try {
      // Call API to generate DOCX with Base64 encoding
      const response = await fetch('/api/generate-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outline: data.outlineText,
          references: data.selectedReferences,
          referenceStyle: data.briefContext.detectedReferenceStyle || 'APA 7',
          briefContext: data.briefContext,
        }),
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const result = await response.json();

      if (!result.docxBase64) {
        alert('Document generated but DOCX format not available. Using text format instead.');
        // Fallback to text download
        const element = document.createElement('a');
        const file = new Blob([generatedDocument], { type: 'text/plain' });
        element.href = URL.createObjectURL(file);
        element.download = `${data.briefContext.subject || 'document'}-${Date.now()}.docx`;
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
        return;
      }

      // Decode Base64 to Blob
      const binaryString = atob(result.docxBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const docxBlob = new Blob([bytes], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      });

      // Download DOCX
      const element = document.createElement('a');
      element.href = URL.createObjectURL(docxBlob);
      element.download = `${data.briefContext.subject || 'document'}-${Date.now()}.docx`;
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);

      alert('Document downloaded as DOCX! Open it in Microsoft Word or Google Docs.');
    } catch (err) {
      console.error('Download error:', err);
      alert('Failed to download DOCX document');
    }
  };

  const escapeXml = (str: string) => {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
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
        <div className="mb-8">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Step 4 of 4</p>
          <h1 className="text-3xl font-bold text-gray-900">Generate Document</h1>
        </div>



        {/* Document Generation Section */}
        {!generatedDocument ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Generate Full Document</h3>
            <p className="text-sm text-gray-600 mb-6">
              Convert your outline into a complete essay with proper citations and reference formatting.
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
                  Generating Document with AI...
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
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Generated Document</h3>
            <div className="bg-gray-50 rounded-lg p-4 mb-4 max-h-[400px] overflow-y-auto border border-gray-200">
              <pre className="text-sm text-gray-800 whitespace-pre-wrap break-words font-sans">
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
