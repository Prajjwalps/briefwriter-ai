import { useState, useCallback, useRef } from 'react';
import {
  Upload, FileText, FileImage, FileSpreadsheet, X, ChevronDown,
  Loader2, CheckCircle2, AlertCircle, Sparkles, ArrowRight, BookOpen,
  ChevronRight, MessageSquare, Paperclip
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ReferenceStyle, WordLimit, UploadedFile, BriefContext,
  SupportMaterial,
} from '@/types';
import { analyzeContent, AnalysisInput } from '@/lib/analysisEngine';

// ── Constants ──────────────────────────────────────────────────────────────

const REFERENCE_STYLES: { value: ReferenceStyle; label: string; description?: string }[] = [
  { value: 'auto-detect', label: '✦ Auto-Detect', description: 'Detect from brief; defaults to APA 7' },
  { value: 'apa7',        label: 'APA 7th Edition',    description: 'American Psychological Association' },
  { value: 'apa6',        label: 'APA 6th Edition' },
  { value: 'mla9',        label: 'MLA 9th Edition',    description: 'Modern Language Association' },
  { value: 'chicago17',   label: 'Chicago 17th Edition' },
  { value: 'harvard',     label: 'Harvard Referencing' },
  { value: 'ieee',        label: 'IEEE Style',          description: 'Engineering & Technology' },
  { value: 'vancouver',   label: 'Vancouver Style',     description: 'Medical & Health Sciences' },
  { value: 'oxford',      label: 'Oxford Referencing' },
  { value: 'oscola',      label: 'OSCOLA',              description: 'Legal Writing' },
];

const WORD_LIMITS: { value: WordLimit; label: string }[] = [
  { value: 'auto-detect', label: '✦ Auto-Detect from Brief' },
  { value: '500',         label: '500 words' },
  { value: '750',         label: '750 words' },
  { value: '1000',        label: '1,000 words' },
  { value: '1500',        label: '1,500 words' },
  { value: '2000',        label: '2,000 words' },
  { value: '2500',        label: '2,500 words' },
  { value: '3000',        label: '3,000 words' },
  { value: '4000',        label: '4,000 words' },
  { value: '5000',        label: '5,000 words' },
  { value: '7500',        label: '7,500 words' },
  { value: '10000',       label: '10,000 words' },
];

const ACCEPTED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif',
  'text/plain',
];

const ACCEPTED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.txt'];

const DEFAULT_SUPPORT_MATERIALS: SupportMaterial[] = [
  { type: 'case-study',        label: 'Case Study',        enabled: false, inputMode: 'file', text: '', files: [] },
  { type: 'reading-list',      label: 'Reading List',      enabled: false, inputMode: 'file', text: '', files: [] },
  { type: 'lecture-notes',     label: 'Lecture Notes',     enabled: false, inputMode: 'file', text: '', files: [] },
  { type: 'previous-feedback', label: 'Previous Feedback', enabled: false, inputMode: 'file', text: '', files: [] },
  { type: 'module-handbook',   label: 'Module Handbook',   enabled: false, inputMode: 'file', text: '', files: [] },
  { type: 'other',             label: 'Other Materials',   enabled: false, inputMode: 'file', text: '', files: [] },
];

// ── Helpers ────────────────────────────────────────────────────────────────

function getFileIcon(type: string) {
  if (type.includes('pdf')) return <FileText className="w-4 h-4 text-red-500" />;
  if (type.includes('word') || type.includes('document')) return <FileText className="w-4 h-4 text-blue-500" />;
  if (type.includes('image')) return <FileImage className="w-4 h-4 text-purple-500" />;
  return <FileSpreadsheet className="w-4 h-4 text-gray-400" />;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function toUploadedFiles(fileList: FileList | File[]): UploadedFile[] {
  return Array.from(fileList)
    .filter(f => {
      const ext = '.' + f.name.split('.').pop()?.toLowerCase();
      return ACCEPTED_TYPES.includes(f.type) || ACCEPTED_EXTENSIONS.includes(ext);
    })
    .map(f => ({ file: f, name: f.name, size: f.size, type: f.type }));
}

// ── InputModeToggle ────────────────────────────────────────────────────────

interface InputModeToggleProps {
  mode: 'file' | 'text';
  onChange: (mode: 'file' | 'text') => void;
}

function InputModeToggle({ mode, onChange }: InputModeToggleProps) {
  return (
    <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit flex-shrink-0">
      <button
        type="button"
        onClick={() => onChange('file')}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-150',
          mode === 'file' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
        )}
      >
        <Paperclip className="w-3 h-3" />
        Upload File
      </button>
      <button
        type="button"
        onClick={() => onChange('text')}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-150',
          mode === 'text' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
        )}
      >
        <MessageSquare className="w-3 h-3" />
        Paste Text
      </button>
    </div>
  );
}

// ── FileDropZone ───────────────────────────────────────────────────────────

interface FileDropZoneProps {
  files: UploadedFile[];
  onAdd: (files: FileList | File[]) => void;
  onRemove: (idx: number) => void;
  compact?: boolean;
}

function FileDropZone({ files, onAdd, onRemove, compact }: FileDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    onAdd(e.dataTransfer.files);
  }, [onAdd]);

  return (
    <div>
      <div
        className={cn(
          'w-full rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer',
          'flex flex-col items-center justify-center text-center',
          compact ? 'py-5 px-4' : 'py-12 px-6',
          isDragging
            ? 'border-slate-900 bg-slate-50 scale-[1.01]'
            : files.length > 0
            ? 'border-gray-200 bg-white hover:border-gray-300'
            : 'border-gray-300 bg-white hover:border-gray-400'
        )}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          multiple
          accept={ACCEPTED_EXTENSIONS.join(',')}
          onChange={e => e.target.files && onAdd(e.target.files)}
        />

        {files.length === 0 ? (
          <>
            <div className={cn(
              'rounded-xl bg-gray-100 flex items-center justify-center mb-3',
              compact ? 'w-10 h-10' : 'w-14 h-14 mb-4'
            )}>
              <Upload className={cn('text-gray-500', compact ? 'w-5 h-5' : 'w-6 h-6')} />
            </div>
            <p className={cn('font-semibold text-gray-800 mb-1', compact ? 'text-sm' : 'text-base')}>
              {compact ? 'Drop files or click to browse' : 'Drop your brief here'}
            </p>
            {!compact && <p className="text-sm text-gray-400 mb-4">or click to browse</p>}
            <div className="flex items-center gap-2 text-[11px] text-gray-400 font-medium mt-2">
              {['PDF', 'DOCX', 'PNG', 'JPG'].map(ext => (
                <span key={ext} className="px-2 py-0.5 bg-gray-100 rounded">{ext}</span>
              ))}
            </div>
          </>
        ) : (
          <div className="w-full space-y-2" onClick={e => e.stopPropagation()}>
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-200">
                {getFileIcon(f.type)}
                <div className="flex-1 text-left min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{f.name}</p>
                  <p className="text-xs text-gray-400">{formatBytes(f.size)}</p>
                </div>
                <button
                  onClick={() => onRemove(i)}
                  className="p-1 rounded-full hover:bg-gray-200 transition-colors"
                >
                  <X className="w-3.5 h-3.5 text-gray-400" />
                </button>
              </div>
            ))}
            <button
              onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
              className="w-full mt-1 text-xs text-gray-400 hover:text-gray-600 py-2 transition-colors border border-dashed border-gray-200 rounded-xl hover:border-gray-300"
            >
              + Add another file
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── SupportMaterialRow ─────────────────────────────────────────────────────

interface SupportMaterialRowProps {
  material: SupportMaterial;
  onChange: (updated: Partial<SupportMaterial>) => void;
}

function SupportMaterialRow({ material, onChange }: SupportMaterialRowProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors select-none"
        onClick={() => onChange({ enabled: !material.enabled })}
      >
        <div className={cn(
          'w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all duration-150',
          material.enabled ? 'bg-slate-900 border-slate-900' : 'border-gray-300 hover:border-gray-500'
        )}>
          {material.enabled && (
            <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none">
              <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </div>
        <span className="text-sm font-medium text-gray-800 flex-1">{material.label}</span>
        {material.enabled && (
          <ChevronRight className="w-4 h-4 text-gray-400 rotate-90" />
        )}
      </div>

      {material.enabled && (
        <div className="border-t border-gray-100 px-4 py-4 space-y-3 bg-gray-50">
          <InputModeToggle
            mode={material.inputMode}
            onChange={(mode) => onChange({ inputMode: mode })}
          />

          {material.inputMode === 'file' ? (
            <FileDropZone
              files={material.files}
              onAdd={(fl) => {
                const newFiles = toUploadedFiles(fl);
                onChange({ files: [...material.files, ...newFiles] });
              }}
              onRemove={(idx) => onChange({ files: material.files.filter((_, i) => i !== idx) })}
              compact
            />
          ) : (
            <textarea
              className={cn(
                'w-full rounded-lg border border-gray-200 bg-white text-sm text-gray-800 px-3 py-2.5 resize-none',
                'placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-400',
                'min-h-[100px] transition-all'
              )}
              placeholder={`Paste your ${material.label.toLowerCase()} text here…`}
              value={material.text}
              onChange={e => onChange({ text: e.target.value })}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── CustomSelect ───────────────────────────────────────────────────────────

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; description?: string }[];
  label: string;
  disabled?: boolean;
}

function CustomSelect({ value, onChange, options, label, disabled }: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.value === value);
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div className="relative" ref={ref}>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">
        {label}
      </label>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(v => !v)}
        className={cn(
          'w-full flex items-center justify-between px-4 py-3 rounded-lg border text-sm font-medium transition-all duration-150',
          'bg-white border-gray-200 hover:border-gray-400',
          'focus:outline-none focus:ring-2 focus:ring-slate-900/20',
          disabled && 'opacity-50 pointer-events-none',
          open && 'border-slate-900 ring-2 ring-slate-900/10'
        )}
      >
        <span className="text-gray-800">{selected?.label}</span>
        <ChevronDown className={cn('w-4 h-4 text-gray-400 transition-transform duration-200', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-xl overflow-y-auto max-h-64">
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={cn(
                'w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0',
                value === opt.value && 'bg-slate-50 font-semibold'
              )}
            >
              <div className="flex items-center justify-between">
                <span className={cn(value === opt.value ? 'text-slate-900' : 'text-gray-700')}>{opt.label}</span>
                {value === opt.value && <CheckCircle2 className="w-3.5 h-3.5 text-slate-900" />}
              </div>
              {opt.description && (
                <span className="text-xs text-gray-400 mt-0.5 block">{opt.description}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── AnalysisPanel ──────────────────────────────────────────────────────────

interface AnalysisPanelProps {
  context: BriefContext;
  referenceStyle: ReferenceStyle;
  wordLimit: WordLimit;
}

function AnalysisPanel({ context, referenceStyle, wordLimit }: AnalysisPanelProps) {
  const isAutoRef  = referenceStyle === 'auto-detect';
  const isAutoWord = wordLimit === 'auto-detect';
  const effectiveRef  = isAutoRef  ? (context.detectedReferenceStyle ?? 'apa7') : referenceStyle;
  const effectiveWord = isAutoWord ? (context.detectedWordLimit ?? '—')          : wordLimit;

  if (!context.analysisComplete && context.analysisProgress === 0) return null;

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
      {!context.analysisComplete && (
        <div className="w-full bg-gray-200 h-0.5">
          <div
            className="h-0.5 bg-slate-900 transition-all duration-500"
            style={{ width: `${context.analysisProgress}%` }}
          />
        </div>
      )}

      <div className="p-4">
        <div className="flex items-center gap-2 mb-3">
          {context.analysisComplete ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          ) : (
            <Loader2 className="w-4 h-4 text-slate-700 animate-spin flex-shrink-0" />
          )}
          <span className="text-sm font-semibold text-gray-800">
            {context.analysisComplete
              ? 'Context Analysis Complete'
              : `Analysing brief… ${context.analysisProgress}%`}
          </span>
        </div>

        {context.analysisComplete && (
          <div className="space-y-3">
            {context.summary && (
              <p className="text-xs text-gray-500 leading-relaxed border-l-2 border-gray-300 pl-3">
                {context.summary}
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-lg p-3 border border-gray-200">
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1">Reference Style</p>
                <div className="flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-slate-700" />
                  <p className="text-sm font-bold text-slate-900">
                    {REFERENCE_STYLES.find(r => r.value === effectiveRef)?.label ?? effectiveRef.toUpperCase()}
                  </p>
                </div>
                {isAutoRef && !context.detectedReferenceStyle && (
                  <p className="text-[10px] text-amber-600 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> Not detected — using APA 7
                  </p>
                )}
                {isAutoRef && context.detectedReferenceStyle && (
                  <p className="text-[10px] text-emerald-600 mt-1">Detected from brief</p>
                )}
              </div>

              <div className="bg-white rounded-lg p-3 border border-gray-200">
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1">Word Limit</p>
                <p className="text-sm font-bold text-slate-900">
                  {isAutoWord && context.detectedWordLimit
                    ? `${context.detectedWordLimit.toLocaleString()} words`
                    : isAutoWord
                    ? 'Not specified'
                    : `${parseInt(effectiveWord as string).toLocaleString()} words`}
                </p>
                {isAutoWord && !context.detectedWordLimit && (
                  <p className="text-[10px] text-amber-600 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> Not found in brief
                  </p>
                )}
                {isAutoWord && context.detectedWordLimit && (
                  <p className="text-[10px] text-emerald-600 mt-1">Detected from brief</p>
                )}
              </div>
            </div>

            {(context.subject || context.taskType) && (
              <div className="flex flex-wrap gap-2">
                {context.taskType && (
                  <span className="text-xs bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full font-medium">
                    {context.taskType}
                  </span>
                )}
                {context.subject && (
                  <span className="text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full font-medium">
                    {context.subject}
                  </span>
                )}
              </div>
            )}

            {context.keywords && context.keywords.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1.5">Key Concepts</p>
                <div className="flex flex-wrap gap-1.5">
                  {context.keywords.map(k => (
                    <span key={k} className="text-[11px] bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
                      {k}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {context.outline && context.outline.length > 0 && (
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                <p className="text-[10px] uppercase tracking-wider text-blue-400 font-semibold mb-3">
                  Suggested Work Outline
                </p>
                <div className="space-y-3">
                  {context.outline.map((section, idx) => (
                    <div key={idx} className="border-l-2 border-blue-300 pl-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-bold text-blue-900">{section.section}</p>
                        <span className="text-xs font-semibold text-blue-600 bg-blue-100 px-2 py-0.5 rounded">
                          ~{section.wordCount} words
                        </span>
                      </div>
                      <ul className="list-disc list-inside space-y-1 ml-0">
                        {section.points.map((point, pidx) => (
                          <li key={pidx} className="text-xs text-blue-800 leading-relaxed">
                            {point}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
                {context.detectedWordLimit && (
                  <p className="text-xs text-blue-600 mt-3 pt-3 border-t border-blue-200">
                    Total: {context.detectedWordLimit.toLocaleString()} words
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Screen1Data export ─────────────────────────────────────────────────────

export interface Screen1Data {
  files: UploadedFile[];
  briefText: string;
  supportMaterials: SupportMaterial[];
  extraInstructions: string;
  referenceStyle: ReferenceStyle;
  wordLimit: WordLimit;
  context: BriefContext;
}

// ── Screen1 ────────────────────────────────────────────────────────────────

interface Screen1Props {
  onContinue: (data: Screen1Data) => void;
}

export default function Screen1({ onContinue }: Screen1Props) {
  const [briefMode, setBriefMode]   = useState<'file' | 'text'>('file');
  const [files, setFiles]           = useState<UploadedFile[]>([]);
  const [briefText, setBriefText]   = useState('');

  const [materials, setMaterials]   = useState<SupportMaterial[]>(DEFAULT_SUPPORT_MATERIALS);

  const [extraInstructions, setExtraInstructions] = useState('');

  const [referenceStyle, setReferenceStyle] = useState<ReferenceStyle>('auto-detect');
  const [wordLimit, setWordLimit]           = useState<WordLimit>('auto-detect');

  const [briefContext, setBriefContext] = useState<BriefContext>({ analysisComplete: false, analysisProgress: 0 });
  const [isAnalysing, setIsAnalysing]   = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // ── Helpers ──

  const updateMaterial = (idx: number, patch: Partial<SupportMaterial>) => {
    setMaterials(prev => prev.map((m, i) => i === idx ? { ...m, ...patch } : m));
  };

  // Check if brief content exists in either file or text mode
  // Auto-detects if user entered text while in file mode
  const hasBriefContent = files.length > 0 || briefText.trim().length > 0;

  // Debug log to verify fix is applied
  if (typeof window !== 'undefined' && briefText.trim().length > 0) {
    console.log('[DEBUG] hasBriefContent should be true:', { hasBriefContent, filesLen: files.length, briefTextLen: briefText.trim().length });
  }

  // ── Run analysis ──

  const runAnalysis = useCallback(async (
    currentFiles: UploadedFile[],
    currentText: string,
    currentMaterials: SupportMaterial[],
    currentInstructions: string,
  ) => {
    const hasContent = currentFiles.length > 0 || currentText.trim().length > 0;
    if (!hasContent) return;

    setIsAnalysing(true);
    setAnalysisError(null);
    setBriefContext({ analysisComplete: false, analysisProgress: 0 });

    const input: AnalysisInput = {
      files:             currentFiles.map(f => f.file),
      briefText:         currentText,
      supportMaterials:  currentMaterials,
      extraInstructions: currentInstructions,
    };

    try {
      console.log('[DEBUG] Starting analysis with', currentFiles.length, 'files');
      const result = await analyzeContent(
        input,
        (progress) => setBriefContext(prev => ({ ...prev, analysisProgress: progress }))
      );
      console.log('[DEBUG] Analysis result:', result);
      console.log('[DEBUG] Setting analysisComplete to true');
      setBriefContext(prev => ({ ...prev, ...result, analysisComplete: true }));
      console.log('[DEBUG] briefContext state after update');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Analysis failed. Please try again.';
      setAnalysisError(msg);
      setBriefContext({ analysisComplete: false, analysisProgress: 0 });
    } finally {
      setIsAnalysing(false);
    }
  }, []);

  // ── File handlers ──

  // Files are added but analysis is NOT triggered automatically
  const handleAddFiles = useCallback((fileList: FileList | File[]) => {
    const newFiles = toUploadedFiles(fileList);
    if (!newFiles.length) return;
    const updated = [...files, ...newFiles];
    setFiles(updated);
    setBriefContext({ analysisComplete: false, analysisProgress: 0 });
  }, [files]);

  const handleRemoveFile = (idx: number) => {
    const updated = files.filter((_, i) => i !== idx);
    setFiles(updated);
    if (updated.length === 0 && !briefText.trim()) {
      setBriefContext({ analysisComplete: false, analysisProgress: 0 });
    }
  };

  // ── Text brief handler ──

  const handleBriefTextChange = (t: string) => {
    setBriefText(t);
    if (briefContext.analysisComplete || briefContext.analysisProgress > 0) {
      setBriefContext({ analysisComplete: false, analysisProgress: 0 });
    }
  };

  // ── Unified analyse trigger ──

  const handleAnalyse = () => {
    runAnalysis(files, briefText, materials, extraInstructions);
  };

  // ── Continue ──

  const canContinue = hasBriefContent && briefContext.analysisComplete && !isAnalysing;

  const handleContinue = () => {
    if (!canContinue) return;
    onContinue({
      files,
      briefText,
      supportMaterials: materials,
      extraInstructions,
      referenceStyle,
      wordLimit,
      context: briefContext,
    });
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#F7F6F3] flex flex-col">

      {/* ── Header ── */}
      <header className="border-b border-gray-200 bg-white px-4 sm:px-6 py-4 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-gray-900 tracking-tight">BriefWriter AI</h1>
            <p className="text-[10px] text-gray-400 tracking-widest uppercase hidden sm:block">Academic Writing Assistant</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {[1, 2, 3, 4].map(step => (
            <div key={step} className="flex items-center gap-1.5">
              <div className={cn(
                'w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-all',
                step === 1 ? 'bg-slate-900 text-white' : 'bg-gray-200 text-gray-400'
              )}>
                {step}
              </div>
              {step < 4 && <div className="w-4 sm:w-6 h-px bg-gray-200" />}
            </div>
          ))}
        </div>
      </header>

      {/* ── Main ── */}
      <main className="flex-1 px-4 sm:px-6 lg:px-8 xl:px-12 py-6 sm:py-8">
        <div className="max-w-screen-2xl mx-auto">

          {/* Step label */}
          <div className="mb-6">
            <span className="text-[11px] font-bold tracking-widest uppercase text-gray-400">Step 1 of 4</span>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mt-1 tracking-tight">Upload Your Brief</h2>
            <p className="text-sm text-gray-500 mt-1">
              Upload your brief and fill in the settings, then click <span className="font-semibold text-gray-700">Analyse Brief</span> to begin.
            </p>
          </div>

          {/* ── Two-column layout ── */}
          <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-5 items-start">

            {/* ════ Left column — inputs ════ */}
            <div className="space-y-5">

              {/* Assignment Brief card */}
              <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">Assignment Brief</h3>
                    <p className="text-xs text-gray-500 mt-0.5">Upload a file or paste the brief text directly</p>
                  </div>
                  <InputModeToggle
                    mode={briefMode}
                    onChange={(m) => {
                      setBriefMode(m);
                      setBriefContext({ analysisComplete: false, analysisProgress: 0 });
                      setAnalysisError(null);
                    }}
                  />
                </div>

                {briefMode === 'file' ? (
                  <FileDropZone
                    files={files}
                    onAdd={handleAddFiles}
                    onRemove={handleRemoveFile}
                  />
                ) : (
                  <textarea
                    className={cn(
                      'w-full rounded-xl border border-gray-200 text-sm text-gray-800 px-4 py-3 resize-none',
                      'placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-400',
                      'min-h-[220px] transition-all'
                    )}
                    placeholder="Paste your assignment brief or instructions here…"
                    value={briefText}
                    onChange={e => handleBriefTextChange(e.target.value)}
                  />
                )}
              </div>

              {/* Support Materials card */}
              <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
                <div>
                  <h3 className="text-sm font-bold text-gray-900">Support Materials</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Add additional materials to improve the analysis (optional)</p>
                </div>
                <div className="space-y-2">
                  {materials.map((mat, idx) => (
                    <SupportMaterialRow
                      key={mat.type}
                      material={mat}
                      onChange={(patch) => updateMaterial(idx, patch)}
                    />
                  ))}
                </div>
              </div>

            </div>

            {/* ════ Right column — settings, analyse, results ════ */}
            <div className="space-y-5">

              {/* Settings card */}
              <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <h3 className="text-sm font-bold text-gray-900 mb-4">Settings</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-4">
                  <CustomSelect
                    label="Referencing Style"
                    value={referenceStyle}
                    onChange={v => setReferenceStyle(v as ReferenceStyle)}
                    options={REFERENCE_STYLES}
                    disabled={isAnalysing}
                  />
                  <CustomSelect
                    label="Word Limit"
                    value={wordLimit}
                    onChange={v => setWordLimit(v as WordLimit)}
                    options={WORD_LIMITS}
                    disabled={isAnalysing}
                  />
                </div>
              </div>

              {/* Extra Instructions card */}
              <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <h3 className="text-sm font-bold text-gray-900 mb-1">Extra Instructions</h3>
                <p className="text-xs text-gray-500 mb-3">Any specific guidance for the AI analysis (optional)</p>
                <textarea
                  className={cn(
                    'w-full rounded-xl border border-gray-200 text-sm text-gray-800 px-4 py-3 resize-none',
                    'placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-400',
                    'min-h-[80px] transition-all'
                  )}
                  placeholder="e.g. 'Focus on the critical analysis section', 'This is a master's level assignment'…"
                  value={extraInstructions}
                  onChange={e => setExtraInstructions(e.target.value)}
                />
              </div>

              {/* ── Analyse Brief button ── */}
              {hasBriefContent && !briefContext.analysisComplete && (
                <button
                  type="button"
                  onClick={handleAnalyse}
                  disabled={isAnalysing}
                  className={cn(
                    'w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-bold transition-all duration-200',
                    isAnalysing
                      ? 'bg-slate-700 text-white cursor-not-allowed'
                      : 'bg-slate-900 text-white hover:bg-slate-800 shadow-sm hover:shadow-md active:scale-[0.99]'
                  )}
                >
                  {isAnalysing ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Analysing Brief…</>
                  ) : (
                    <><Sparkles className="w-4 h-4" /> Analyse Brief</>
                  )}
                </button>
              )}

              {/* ── Analysis Panel ── */}
              {(hasBriefContent || isAnalysing) && (
                <AnalysisPanel
                  context={briefContext}
                  referenceStyle={referenceStyle}
                  wordLimit={wordLimit}
                />
              )}

              {/* ── Re-analyse button (after success) ── */}
              {briefContext.analysisComplete && hasBriefContent && (
                <button
                  type="button"
                  onClick={handleAnalyse}
                  disabled={isAnalysing}
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold text-gray-500 hover:text-gray-700 bg-white border border-gray-200 hover:border-gray-300 transition-all"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Re-analyse Brief
                </button>
              )}

              {/* ── Error ── */}
              {analysisError && (
                <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-red-700">Analysis Failed</p>
                    <p className="text-xs text-red-600 mt-0.5">{analysisError}</p>
                    <button
                      type="button"
                      onClick={() => runAnalysis(files, briefText, materials, extraInstructions)}
                      className="text-xs font-semibold text-red-700 hover:text-red-900 underline mt-1"
                    >
                      Try again
                    </button>
                  </div>
                </div>
              )}

              {/* ── Continue CTA ── */}
              <div className="pb-4">
                <button
                  onClick={handleContinue}
                  disabled={!canContinue}
                  className={cn(
                    'w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-bold transition-all duration-200',
                    canContinue
                      ? 'bg-slate-900 text-white hover:bg-slate-800 shadow-sm hover:shadow-md'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  )}
                >
                  {isAnalysing ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Analysing…</>
                  ) : canContinue ? (
                    <>Continue to References <ArrowRight className="w-4 h-4" /></>
                  ) : !hasBriefContent ? (
                    'Upload or paste a brief to continue'
                  ) : !briefContext.analysisComplete ? (
                    'Analyse brief first to continue'
                  ) : (
                    <>Continue to References <ArrowRight className="w-4 h-4" /></>
                  )}
                </button>

                {briefContext.analysisComplete && (
                  <p className="text-center text-xs text-gray-400 mt-3">
                    Analysis ready · Adjust settings above if needed
                  </p>
                )}
              </div>

            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
