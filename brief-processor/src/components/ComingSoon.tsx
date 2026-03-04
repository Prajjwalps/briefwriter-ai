import { Sparkles, ArrowLeft, Construction } from 'lucide-react';
import { ReferenceStyle, WordLimit, UploadedFile, BriefContext } from '@/types';
import { cn } from '@/lib/utils';

interface ComingSoonProps {
  screenNumber: number;
  title: string;
  data: {
    files: UploadedFile[];
    referenceStyle: ReferenceStyle;
    wordLimit: WordLimit;
    context: BriefContext;
  };
  onBack: () => void;
}

export default function ComingSoon({ screenNumber, title, data, onBack }: ComingSoonProps) {
  const REFERENCE_LABELS: Record<ReferenceStyle, string> = {
    'auto-detect': 'Auto-Detect',
    apa7: 'APA 7th Edition',
    apa6: 'APA 6th Edition',
    mla9: 'MLA 9th Edition',
    chicago17: 'Chicago 17th',
    harvard: 'Harvard',
    ieee: 'IEEE',
    vancouver: 'Vancouver',
    oxford: 'Oxford',
    oscola: 'OSCOLA',
  };

  const effectiveRef = data.referenceStyle === 'auto-detect'
    ? (data.context.detectedReferenceStyle ?? 'apa7')
    : data.referenceStyle;

  const effectiveWordLimit = data.wordLimit === 'auto-detect'
    ? (data.context.detectedWordLimit ? `${data.context.detectedWordLimit.toLocaleString()} words` : 'Not specified')
    : `${parseInt(data.wordLimit).toLocaleString()} words`;

  return (
    <div className="min-h-screen bg-[#F7F6F3] flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white px-6 py-4 flex items-center justify-between">
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
                step < screenNumber ? 'bg-emerald-500 text-white' :
                step === screenNumber ? 'bg-slate-900 text-white' :
                'bg-gray-200 text-gray-400'
              )}>
                {step}
              </div>
              {step < 4 && <div className={cn('w-6 h-px', step < screenNumber ? 'bg-emerald-400' : 'bg-gray-200')} />}
            </div>
          ))}
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-10 max-w-2xl mx-auto w-full">
        <div className="w-full bg-white rounded-2xl border border-gray-200 p-8 text-center shadow-sm">
          <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Construction className="w-7 h-7 text-amber-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Step {screenNumber}: {title}</h2>
          <p className="text-sm text-gray-500 mb-6">
            This screen is part of the next phase of development. The context from Step 1 has been captured and is ready.
          </p>

          {/* Summary card */}
          <div className="text-left bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-3">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Context Captured from Brief</p>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider">Files</p>
                <p className="font-semibold text-gray-800">{data.files.length} file{data.files.length !== 1 ? 's' : ''}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider">Reference Style</p>
                <p className="font-semibold text-gray-800">{REFERENCE_LABELS[effectiveRef]}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider">Word Limit</p>
                <p className="font-semibold text-gray-800">{effectiveWordLimit}</p>
              </div>
              {data.context.taskType && (
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider">Task Type</p>
                  <p className="font-semibold text-gray-800">{data.context.taskType}</p>
                </div>
              )}
              {data.context.subject && (
                <div className="col-span-2">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider">Subject</p>
                  <p className="font-semibold text-gray-800">{data.context.subject}</p>
                </div>
              )}
            </div>
          </div>

          <button
            onClick={onBack}
            className="mt-6 flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors mx-auto"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Step 1
          </button>
        </div>
      </main>
    </div>
  );
}
