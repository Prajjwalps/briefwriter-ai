import { useState, useRef } from 'react';
import {
  Sparkles, ArrowLeft, ArrowRight, Search, Copy, ExternalLink,
  Loader2, AlertCircle, BookOpen, Newspaper, Globe, Building2,
  BookMarked, CheckSquare, Square, ChevronDown, ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ReferenceStyle, Reference, SourceType } from '@/types';
import { Screen1Data } from './Screen1';

// ── Types ──────────────────────────────────────────────────────────────────

interface Screen2Props {
  data: Screen1Data;
  onBack: () => void;
  onContinue: (selectedReferences: Reference[], selectedReferenceIds: Set<string>) => void;
}

interface Filters {
  includeArticles: boolean;
  includeBooks: boolean;
  includeConferencePapers: boolean;
  includeDissertations: boolean;
  includeReports: boolean;
  includeNews: boolean;
  includeBlogs: boolean;
  includeGovernment: boolean;
  includeIndustry: boolean;
  fullTextOnly: boolean;
  peerReviewedOnly: boolean;
  languageEnglishOnly: boolean;
  yearFrom: number;
  yearTo: number;
  maxResults: number;
  extraSearchInstructions: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear();

const DEFAULT_FILTERS: Filters = {
  includeArticles:        false,
  includeBooks:           false,
  includeConferencePapers: false,
  includeDissertations:   false,
  includeReports:         false,
  includeNews:            false,
  includeBlogs:           false,
  includeGovernment:      false,
  includeIndustry:        false,
  fullTextOnly:           false,
  peerReviewedOnly:       false,
  languageEnglishOnly:    false,
  yearFrom:               CURRENT_YEAR - 10,
  yearTo:                 CURRENT_YEAR,
  maxResults:             10,
  extraSearchInstructions: '',
};

const ACADEMIC_SOURCE_TYPES = ['includeArticles', 'includeBooks', 'includeConferencePapers', 'includeDissertations', 'includeReports'] as const;
const NON_ACADEMIC_SOURCE_TYPES = ['includeNews', 'includeBlogs', 'includeGovernment', 'includeIndustry'] as const;

const REFERENCE_LABELS: Record<ReferenceStyle, string> = {
  'auto-detect': 'Auto-Detect',
  apa7:         'APA 7th',
  apa6:         'APA 6th',
  mla9:         'MLA 9th',
  chicago17:    'Chicago 17th',
  harvard:      'Harvard',
  ieee:         'IEEE',
  vancouver:    'Vancouver',
  oxford:       'Oxford',
  oscola:       'OSCOLA',
};

const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  article:           'Journal Article',
  book:              'Book',
  dissertation:      'Dissertation',
  'conference-paper': 'Conference Paper',
  report:            'Report',
  news:              'News',
  blog:              'Expert Blog',
  government:        'Government',
  industry:          'Industry',
};

const SOURCE_TYPE_COLORS: Record<SourceType, string> = {
  article:           'bg-blue-100 text-blue-700',
  book:              'bg-purple-100 text-purple-700',
  dissertation:      'bg-indigo-100 text-indigo-700',
  'conference-paper': 'bg-cyan-100 text-cyan-700',
  report:            'bg-teal-100 text-teal-700',
  news:              'bg-orange-100 text-orange-700',
  blog:              'bg-pink-100 text-pink-700',
  government:        'bg-emerald-100 text-emerald-700',
  industry:          'bg-amber-100 text-amber-700',
};

// ── Sub-components ─────────────────────────────────────────────────────────

function CheckboxRow({
  checked,
  onChange,
  label,
  sub,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  sub?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      className={cn(
        'flex items-start gap-2.5 text-left w-full group transition-opacity',
        disabled && 'opacity-40 cursor-not-allowed'
      )}
    >
      <span className="mt-0.5 shrink-0">
        {checked && !disabled
          ? <CheckSquare className="w-4 h-4 text-slate-900" />
          : <Square className="w-4 h-4 text-gray-300 group-hover:text-gray-400" />
        }
      </span>
      <span>
        <span className="text-sm font-medium text-gray-800">{label}</span>
        {sub && <span className="block text-[11px] text-gray-400 leading-tight mt-0.5">{sub}</span>}
      </span>
    </button>
  );
}

function Pill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
        active
          ? 'bg-slate-900 text-white'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      )}
    >
      {label}
    </button>
  );
}

function ReferenceCard({
  item,
  index,
  isSelected,
  onToggleSelect,
}: {
  item: Reference;
  index: number;
  isSelected: boolean;
  onToggleSelect: () => void;
}) {
  const r = item;
  const [copied, setCopied] = useState(false);
  const [annotationOpen, setAnnotationOpen] = useState(true);

  const handleCopy = () => {
    navigator.clipboard.writeText(r.formattedReference).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const typeLabel = SOURCE_TYPE_LABELS[r.type] ?? r.type;
  const typeColor = SOURCE_TYPE_COLORS[r.type] ?? 'bg-gray-100 text-gray-600';

  return (
    <div className={cn("bg-white rounded-xl border-2 p-5 shadow-sm hover:shadow-md transition-all", isSelected ? 'border-slate-900 bg-slate-50' : 'border-gray-200')}>
      {/* Top row: checkbox + badges + actions */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3 flex-1">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggleSelect}
            className="w-5 h-5 mt-0.5 cursor-pointer accent-slate-900 rounded"
            aria-label={`Select ${r.title}`}
          />
          <div className="flex flex-wrap gap-1.5">
          <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full', typeColor)}>
            {typeLabel}
          </span>
          {r.isOpenAccess && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
              Open Access
            </span>
          )}
          {r.verified && r.verificationMethod === 'web-search' && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
              ✓ Web-Verified Link
            </span>
          )}
          {!r.verified && r.aiGenerated && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
              ⚠ AI-Generated — verify link
            </span>
          )}
          {r.urlVerified === false && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
              ⚠ Link may be broken
            </span>
          )}
        </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {r.url && (
            <a
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Link
            </a>
          )}
          <button
            onClick={handleCopy}
            className={cn(
              'flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg transition-all',
              copied
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            <Copy className="w-3 h-3" />
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Title */}
      <h3 className="text-sm font-bold text-gray-900 leading-snug mb-1">
        {r.title}
      </h3>

      {/* Authors / source / year */}
      <p className="text-xs text-gray-500 mb-1">
        {r.authors.length > 0
          ? `${r.authors.slice(0, 3).join(', ')}${r.authors.length > 3 ? ' et al.' : ''}`
          : 'Author unknown'}
        {r.year ? ` (${r.year})` : ''}
        {r.sourceName ? ` · ${r.sourceName}` : ''}
      </p>

      {/* Citation count (academic only) */}
      {!r.aiGenerated && r.citationCount > 0 && (
        <p className="text-xs text-gray-400 mb-3">
          <span className="font-semibold text-gray-600">{r.citationCount.toLocaleString()}</span> citations
        </p>
      )}

      {/* Annotation */}
      {r.annotation && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <button
            onClick={() => setAnnotationOpen(v => !v)}
            className="flex items-center gap-1 text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 hover:text-gray-600 transition-colors"
          >
            Annotation
            {annotationOpen
              ? <ChevronUp className="w-3 h-3" />
              : <ChevronDown className="w-3 h-3" />
            }
          </button>
          {annotationOpen && (
            <p className="text-xs text-gray-700 leading-relaxed italic">{r.annotation}</p>
          )}
        </div>
      )}

      {/* Formatted reference */}
      {r.formattedReference && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Reference</p>
          <p className="text-xs text-gray-800 font-mono leading-relaxed bg-gray-50 rounded-lg p-3 border border-gray-100">
            {r.formattedReference}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Progress labels ────────────────────────────────────────────────────────

const PROGRESS_LABELS = [
  'Querying academic databases…',
  'Fetching sources…',
  'Generating annotations…',
  'Formatting references…',
];

// ── Main Screen2 component ─────────────────────────────────────────────────

export default function Screen2({ data, onBack, onContinue }: Screen2Props) {
  const { context, referenceStyle, wordLimit } = data;

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [isLoading, setIsLoading]          = useState(false);
  const [error, setError]                  = useState<string | null>(null);
  const [results, setResults]              = useState<Reference[] | null>(null);
  const [showAllKeywords, setShowAllKeywords] = useState(false);
  const [selectedReferenceIds, setSelectedReferenceIds] = useState<Set<string>>(new Set());
  const [progress, setProgress]            = useState(0);
  const [progressLabel, setProgressLabel]  = useState('');
  const timerRef                           = useRef<ReturnType<typeof setInterval> | null>(null);

  const startProgress = () => {
    setProgress(5);
    setProgressLabel(PROGRESS_LABELS[0]);
    let labelIdx = 0;
    timerRef.current = setInterval(() => {
      setProgress(p => {
        if (p >= 88) return p;
        const next = p + Math.random() * 7;
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

  const keywords     = context.keywords ?? [];
  const subject      = context.subject ?? '';
  const taskType     = context.taskType ?? '';
  const effectiveRef: ReferenceStyle = referenceStyle === 'auto-detect'
    ? (context.detectedReferenceStyle ?? 'apa7')
    : referenceStyle;

  const hasAnySource =
    filters.includeArticles || filters.includeBooks || filters.includeConferencePapers ||
    filters.includeDissertations || filters.includeReports ||
    filters.includeNews || filters.includeBlogs || filters.includeGovernment || filters.includeIndustry;

  function set<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters(prev => {
      const next = { ...prev, [key]: value };
      return next;
    });
  }

  async function handleSearch() {
    setError(null);
    setResults(null);
    setSelectedReferenceIds(new Set());
    setIsLoading(true);
    startProgress();

    try {
      const body = {
        keywords,
        subject,
        taskType,
        summary: context.summary ?? '',
        referenceStyle: effectiveRef,
        filters: {
          includeArticles:         filters.includeArticles,
          includeBooks:            filters.includeBooks,
          includeConferencePapers: filters.includeConferencePapers,
          includeDissertations:    filters.includeDissertations,
          includeReports:          filters.includeReports,
          includeNews:             filters.includeNews,
          includeBlogs:            filters.includeBlogs,
          includeGovernment:       filters.includeGovernment,
          includeIndustry:         filters.includeIndustry,
          fullTextOnly:            filters.fullTextOnly,
          peerReviewedOnly:        filters.peerReviewedOnly,
          languageEnglishOnly:     filters.languageEnglishOnly,
          yearFrom:                filters.yearFrom,
          yearTo:                  filters.yearTo,
          maxResults:              filters.maxResults,
          extraSearchInstructions: filters.extraSearchInstructions,
        },
      };

      const res = await fetch('/api/references', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error ?? `Server error ${res.status}`);
      }

      const refs: Reference[] = await res.json();
      setResults(refs);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      finishProgress();
      setIsLoading(false);
    }
  }

  const handleSelectAllAcademic = () => {
    const allChecked = ACADEMIC_SOURCE_TYPES.every(type => filters[type as keyof typeof filters]);
    ACADEMIC_SOURCE_TYPES.forEach(type => set(type as keyof Filters, !allChecked as any));
  };

  const handleSelectAllNonAcademic = () => {
    const allChecked = NON_ACADEMIC_SOURCE_TYPES.every(type => filters[type as keyof typeof filters]);
    NON_ACADEMIC_SOURCE_TYPES.forEach(type => set(type as keyof Filters, !allChecked as any));
  };

  const handleSelectAllReferences = () => {
    if (!results) return;
    if (selectedReferenceIds.size === results.length) {
      setSelectedReferenceIds(new Set());
    } else {
      setSelectedReferenceIds(new Set(results.map(r => r.id)));
    }
  };

  const visibleKeywords = showAllKeywords ? keywords : keywords.slice(0, 3);

  return (
    <div className="min-h-screen bg-[#F7F6F3] flex flex-col">
      {/* ── Header ── */}
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
                step < 2  ? 'bg-emerald-500 text-white' :
                step === 2 ? 'bg-slate-900 text-white' :
                'bg-gray-200 text-gray-400'
              )}>
                {step < 2 ? '✓' : step}
              </div>
              {step < 4 && <div className={cn('w-6 h-px', step < 2 ? 'bg-emerald-400' : 'bg-gray-200')} />}
            </div>
          ))}
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-8 space-y-5">
        {/* ── Step label ── */}
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold">Step 2 of 4</p>
          <h2 className="text-2xl font-bold text-gray-900 mt-0.5">Find References</h2>
        </div>

        {/* ── Context chips ── */}
        <div className="flex flex-wrap gap-2">
          {subject && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-white border border-gray-200 text-gray-700 px-3 py-1.5 rounded-full shadow-sm">
              <BookOpen className="w-3 h-3 text-gray-400" />
              {subject}
            </span>
          )}
          {taskType && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-white border border-gray-200 text-gray-700 px-3 py-1.5 rounded-full shadow-sm">
              {taskType}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-white border border-gray-200 text-gray-700 px-3 py-1.5 rounded-full shadow-sm">
            {REFERENCE_LABELS[effectiveRef]}
          </span>
          {visibleKeywords.map(kw => (
            <span key={kw} className="inline-flex items-center text-xs font-medium bg-slate-100 text-slate-600 px-3 py-1.5 rounded-full">
              {kw}
            </span>
          ))}
          {keywords.length > 3 && !showAllKeywords && (
            <button
              onClick={() => setShowAllKeywords(true)}
              className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1.5 font-medium"
            >
              +{keywords.length - 3} more
            </button>
          )}
        </div>

        {/* ── Search Configuration Card ── */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-6 shadow-sm">

          {/* Section A — Academic Sources */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <BookMarked className="w-4 h-4 text-gray-500" />
              <p className="text-xs font-bold text-gray-700 uppercase tracking-widest">Academic Sources</p>
              <span className="text-[10px] text-gray-400 font-medium">via OpenAlex — real DOIs &amp; citations</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <CheckboxRow checked={filters.includeArticles}         onChange={v => set('includeArticles', v)}         label="Journal Articles"       />
              <CheckboxRow checked={filters.includeBooks}            onChange={v => set('includeBooks', v)}            label="Books &amp; Book Chapters" />
              <CheckboxRow checked={filters.includeConferencePapers} onChange={v => set('includeConferencePapers', v)} label="Conference Papers"      />
              <CheckboxRow checked={filters.includeDissertations}    onChange={v => set('includeDissertations', v)}    label="Theses &amp; Dissertations" />
              <CheckboxRow checked={filters.includeReports}          onChange={v => set('includeReports', v)}          label="Reports &amp; Working Papers" />
            </div>
            <button
              onClick={handleSelectAllAcademic}
              className="mt-2 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 hover:border-slate-900 hover:bg-slate-50 transition-all text-gray-600 hover:text-slate-900"
            >
              {ACADEMIC_SOURCE_TYPES.every(type => filters[type as keyof typeof filters]) ? 'Deselect All Academic' : 'Select All Academic'}
            </button>
          </div>

          <div className="border-t border-gray-100" />

          {/* Section B — Non-Academic */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Globe className="w-4 h-4 text-gray-500" />
              <p className="text-xs font-bold text-gray-700 uppercase tracking-widest">Credible Non-Academic Sources</p>
            </div>
            <p className="text-[11px] text-amber-600 bg-amber-50 rounded-lg px-3 py-2 mb-3 border border-amber-100">
              ⚠ Sources suggested by AI based on known credible institutions — verify links before use
            </p>
            <div className="grid grid-cols-2 gap-3">
              <CheckboxRow
                checked={filters.includeNews}
                onChange={v => set('includeNews', v)}
                label="News Articles"
                sub="BBC, Reuters, AP, Guardian, NYT"
              />
              <CheckboxRow
                checked={filters.includeGovernment}
                onChange={v => set('includeGovernment', v)}
                label="Government &amp; Health Bodies"
                sub="WHO, CDC, NHS, Gov.uk, UN"
              />
              <CheckboxRow
                checked={filters.includeIndustry}
                onChange={v => set('includeIndustry', v)}
                label="Industry &amp; Think Tanks"
                sub="McKinsey, Deloitte, OECD, World Bank"
              />
              <CheckboxRow
                checked={filters.includeBlogs}
                onChange={v => set('includeBlogs', v)}
                label="Expert Publications"
                sub="HBR, Scientific American, Nature News"
              />
            </div>
            <button
              onClick={handleSelectAllNonAcademic}
              className="mt-2 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 hover:border-slate-900 hover:bg-slate-50 transition-all text-gray-600 hover:text-slate-900"
            >
              {NON_ACADEMIC_SOURCE_TYPES.every(type => filters[type as keyof typeof filters]) ? 'Deselect All Non-Academic' : 'Select All Non-Academic'}
            </button>
          </div>

          <div className="border-t border-gray-100" />

          {/* Access & Quality */}
          <div>
            <p className="text-xs font-bold text-gray-700 uppercase tracking-widest mb-3">Access &amp; Quality</p>
            <div className="space-y-2.5">
              <CheckboxRow
                checked={filters.languageEnglishOnly}
                onChange={v => set('languageEnglishOnly', v)}
                label="English Language Only"
                sub="Applies to all sources"
              />

              {/* Academic-only filters */}
              <div className={cn(
                'border-t border-gray-100 pt-2.5 mt-2.5 space-y-2.5',
                !hasAnySource && 'opacity-40 pointer-events-none'
              )}>
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Academic Sources Only</p>
                <CheckboxRow
                  checked={filters.fullTextOnly}
                  onChange={v => set('fullTextOnly', v)}
                  label="Full Text / Open Access Only"
                  sub="Academic sources with available full text"
                  disabled={!hasAnySource}
                />
                <CheckboxRow
                  checked={filters.peerReviewedOnly}
                  onChange={v => set('peerReviewedOnly', v)}
                  label="Peer-Reviewed Only"
                  sub="Academic sources only; disables non-academic section"
                  disabled={!hasAnySource}
                />
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100" />

          {/* Time Frame */}
          <div>
            <p className="text-xs font-bold text-gray-700 uppercase tracking-widest mb-3">Time Frame</p>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-sm text-gray-600">Published between</span>
              <input
                type="number"
                value={filters.yearFrom}
                onChange={e => set('yearFrom', parseInt(e.target.value) || CURRENT_YEAR - 10)}
                className="w-20 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-slate-900"
                min={1900}
                max={CURRENT_YEAR}
              />
              <span className="text-sm text-gray-400">and</span>
              <input
                type="number"
                value={filters.yearTo}
                onChange={e => set('yearTo', parseInt(e.target.value) || CURRENT_YEAR)}
                className="w-20 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-slate-900"
                min={1900}
                max={CURRENT_YEAR}
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {[
                { label: 'Last 5 yrs',  from: CURRENT_YEAR - 5  },
                { label: 'Last 10 yrs', from: CURRENT_YEAR - 10 },
                { label: 'Last 20 yrs', from: CURRENT_YEAR - 20 },
                { label: 'Any time',    from: 1900               },
              ].map(q => (
                <Pill
                  key={q.label}
                  label={q.label}
                  active={filters.yearFrom === q.from && filters.yearTo === CURRENT_YEAR}
                  onClick={() => { set('yearFrom', q.from); set('yearTo', CURRENT_YEAR); }}
                />
              ))}
            </div>
          </div>

          <div className="border-t border-gray-100" />

          {/* Number of References to Find (Slider) */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold text-gray-700 uppercase tracking-widest">Number of References</p>
              <span className="text-sm font-semibold text-slate-900">{filters.maxResults}</span>
            </div>
            <input
              type="range"
              min="1"
              max="20"
              value={filters.maxResults}
              onChange={(e) => set('maxResults', Number(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-slate-900"
            />
            <p className="text-[11px] text-gray-400 mt-2">Drag to select 1–20 references</p>
          </div>

          <div className="border-t border-gray-100" />

          {/* Search Instructions */}
          <div>
            <label className="text-xs font-bold text-gray-700 uppercase tracking-widest block mb-3">
              Search Instructions <span className="text-gray-400 font-normal normal-case tracking-normal">(optional)</span>
            </label>
            <textarea
              value={filters.extraSearchInstructions}
              onChange={(e) => set('extraSearchInstructions', e.target.value)}
              placeholder="e.g., Prioritize recent sources, focus on case studies, emphasize empirical research..."
              className="w-full h-20 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent resize-none"
            />
          </div>
        </div>

        {/* ── Progress Bar ── */}
        {progress > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
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

        {/* ── Find References button ── */}
        <button
          onClick={handleSearch}
          disabled={isLoading || !hasAnySource}
          className={cn(
            'w-full flex items-center justify-center gap-2 py-4 rounded-xl font-semibold text-sm transition-all',
            isLoading || !hasAnySource
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
              : 'bg-slate-900 text-white hover:bg-slate-800 active:scale-[0.99] shadow-sm'
          )}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Searching for references…
            </>
          ) : (
            <>
              <Search className="w-4 h-4" />
              Find References
            </>
          )}
        </button>

        {!hasAnySource && !isLoading && (
          <p className="text-xs text-center text-amber-600">Select at least one source type above to search.</p>
        )}

        {/* ── Error ── */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* ── Results ── */}
        {results !== null && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-gray-900 mb-2">
                  {results.length === 0
                    ? 'No references found'
                    : `${results.length} reference${results.length !== 1 ? 's' : ''} found`}
                </p>
                {results.length > 0 && (
                  <button
                    onClick={handleSelectAllReferences}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 hover:border-slate-900 hover:bg-slate-50 transition-all text-gray-600 hover:text-slate-900"
                  >
                    {selectedReferenceIds.size === results.length ? 'Deselect All' : 'Select All References'}
                  </button>
                )}
              </div>
              {results.length > 0 && (
                <p className="text-xs text-gray-400">{REFERENCE_LABELS[effectiveRef]} style</p>
              )}
            </div>

            {results.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                <Search className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500">No results matched your filters. Try broadening the time range, removing citation requirements, or adding more source types.</p>
              </div>
            ) : (
              <>
                <div className="mb-4">
                  <p className="text-sm text-gray-600">
                    <span className="font-semibold">{selectedReferenceIds.size}</span> of <span className="font-semibold">{results.length}</span> selected
                  </p>
                </div>
                {results.map((r, i) => (
                  <ReferenceCard
                    key={r.id}
                    item={r}
                    index={i}
                    isSelected={selectedReferenceIds.has(r.id)}
                    onToggleSelect={() => {
                      const updated = new Set(selectedReferenceIds);
                      if (updated.has(r.id)) {
                        updated.delete(r.id);
                      } else {
                        updated.add(r.id);
                      }
                      setSelectedReferenceIds(updated);
                    }}
                  />
                ))}
              </>
            )}
          </div>
        )}

        {/* ── Result Actions ── */}
        {results && results.length > 0 && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => setResults(null)}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 font-medium px-4 py-2 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
            >
              Re-search
            </button>
          </div>
        )}

        {/* ── Navigation ── */}
        <div className="flex items-center justify-between pt-2 pb-8">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Brief Analysis
          </button>
          {results && results.length > 0 && (
            <button
              onClick={() => {
                const selectedRefs = results.filter(r => selectedReferenceIds.has(r.id));
                onContinue(selectedRefs, selectedReferenceIds);
              }}
              disabled={selectedReferenceIds.size === 0}
              className={cn(
                "flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors",
                selectedReferenceIds.size === 0
                  ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                  : "bg-slate-900 text-white hover:bg-slate-800"
              )}
            >
              Continue to Draft
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
