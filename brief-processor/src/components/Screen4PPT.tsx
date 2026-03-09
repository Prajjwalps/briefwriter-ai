import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Loader2, AlertCircle, Download, CheckCircle2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Screen3Data, PptOptions, PptSlide, PptGenerationState } from '@/types';

interface Screen4PPTProps {
  data: Screen3Data;
  pptOptions: PptOptions;
  onBack: () => void;
}

function downloadBase64(base64: string, filename: string, mimeType: string) {
  const byteChars = atob(base64);
  const byteNums = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i);
  const blob = new Blob([byteNums], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function slugify(text: string) {
  return text.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
}

export default function Screen4PPT({ data, pptOptions, onBack }: Screen4PPTProps) {
  const context = data.briefContext;
  const selectedReferences = data.selectedReferences || [];
  const { numSlides, slidesTitles, scriptEnabled, scriptWordsPerSlide, scriptInstructions } = pptOptions;

  const [genState, setGenState] = useState<PptGenerationState>({
    status: 'idle',
    totalSlides: numSlides,
    completedSlides: 0,
    currentSlide: '',
    currentSlideIndex: 0,
    generatedSlides: {},
    generatingScript: false,
    progress: 0,
    progressLabel: '',
    error: null,
    pptxBase64: null,
    scriptDocxBase64: null,
  });

  const cancelledRef = useRef(false);

  const updateState = useCallback((patch: Partial<PptGenerationState>) => {
    setGenState(prev => ({ ...prev, ...patch }));
  }, []);

  const generateSlide = async (
    slideNumber: number,
    slideTitle: string
  ): Promise<PptSlide | null> => {
    const response = await fetch('/api/generate-ppt-slide', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slideNumber,
        totalSlides: numSlides,
        slideTitle,
        briefContext: context,
        selectedReferences,
        referenceStyle: data.referenceStyle,
        outlineText: data.briefContext?.outline ?? [],
        selectedModel: data.selectedModel,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(err.error ?? `Slide ${slideNumber} failed`);
    }

    const result = await response.json();
    return {
      slideNumber,
      title: slideTitle,
      statements: result.statements,
      citations: result.citations,
      wordCount: result.wordCount,
      retryCount: 0,
    } as PptSlide;
  };

  const generateScript = async (
    slide: PptSlide
  ): Promise<string> => {
    const response = await fetch('/api/generate-ppt-script', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slideNumber: slide.slideNumber,
        totalSlides: numSlides,
        slideTitle: slide.title,
        slideBullets: slide.statements,
        scriptWordsPerSlide,
        briefContext: context,
        scriptInstructions,
        selectedModel: data.selectedModel,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(err.error ?? `Script for slide ${slide.slideNumber} failed`);
    }

    const result = await response.json();
    return result.script ?? '';
  };

  const runGeneration = useCallback(async () => {
    cancelledRef.current = false;
    const totalSteps = scriptEnabled ? numSlides * 2 + 2 : numSlides + 1; // slides + scripts + assemble(+script docx)
    let completedSteps = 0;

    const slideProgress = (step: number) => Math.min(98, Math.round((step / totalSteps) * 100));

    updateState({
      status: 'generating-slides',
      totalSlides: numSlides,
      completedSlides: 0,
      currentSlide: slidesTitles[0] ?? 'Slide 1',
      currentSlideIndex: 1,
      generatedSlides: {},
      progress: 2,
      progressLabel: 'Starting generation…',
      error: null,
      pptxBase64: null,
      scriptDocxBase64: null,
    });

    const allSlides: PptSlide[] = [];

    // Phase 1: Generate slide content
    for (let i = 0; i < numSlides; i++) {
      if (cancelledRef.current) return;

      const slideNum = i + 1;
      const title = slidesTitles[i] ?? `Slide ${slideNum}`;

      updateState({
        currentSlide: title,
        currentSlideIndex: slideNum,
        progressLabel: `Generating slide ${slideNum} of ${numSlides}: ${title}`,
        progress: slideProgress(completedSteps),
      });

      try {
        const slide = await generateSlide(slideNum, title);
        if (!slide) continue;

        allSlides.push(slide);
        completedSteps++;

        setGenState(prev => ({
          ...prev,
          completedSlides: prev.completedSlides + 1,
          generatedSlides: { ...prev.generatedSlides, [slideNum]: slide },
          progress: slideProgress(completedSteps),
        }));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        // Add error slide so we can continue
        const errSlide: PptSlide = {
          slideNumber: slideNum,
          title,
          statements: [],
          citations: [],
          wordCount: 0,
          error: msg,
        };
        allSlides.push(errSlide);
        completedSteps++;
        setGenState(prev => ({
          ...prev,
          completedSlides: prev.completedSlides + 1,
          generatedSlides: { ...prev.generatedSlides, [slideNum]: errSlide },
          progress: slideProgress(completedSteps),
        }));
      }
    }

    if (cancelledRef.current) return;

    // Phase 2: Generate scripts (if enabled)
    if (scriptEnabled) {
      updateState({
        status: 'generating-scripts',
        generatingScript: true,
        progressLabel: 'Generating presenter scripts…',
      });

      for (const slide of allSlides) {
        if (cancelledRef.current) return;
        if (slide.error || slide.statements.length === 0) {
          completedSteps++;
          continue;
        }

        updateState({
          currentSlide: slide.title,
          currentSlideIndex: slide.slideNumber,
          progressLabel: `Generating script for slide ${slide.slideNumber}: ${slide.title}`,
          progress: slideProgress(completedSteps),
        });

        try {
          const script = await generateScript(slide);
          slide.script = script;
          setGenState(prev => ({
            ...prev,
            generatedSlides: { ...prev.generatedSlides, [slide.slideNumber]: { ...slide } },
          }));
        } catch {
          // script failure is non-fatal — continue
        }
        completedSteps++;
        updateState({ progress: slideProgress(completedSteps) });
      }
    }

    if (cancelledRef.current) return;

    // Phase 3: Assemble PPTX
    updateState({
      status: 'assembling',
      generatingScript: false,
      progressLabel: 'Assembling presentation…',
      progress: slideProgress(completedSteps),
    });

    try {
      const pptxRes = await fetch('/api/generate-pptx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `${context?.subject ?? 'Presentation'} — ${context?.taskType ?? 'Slides'}`,
          slides: allSlides.filter(s => !s.error).map(s => ({
            slideNumber: s.slideNumber,
            title: s.title,
            statements: s.statements,
          })),
        }),
      });

      if (!pptxRes.ok) throw new Error('PPTX assembly failed');
      const pptxData = await pptxRes.json();
      completedSteps++;
      updateState({ progress: slideProgress(completedSteps), pptxBase64: pptxData.pptxBase64 });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'PPTX assembly failed';
      updateState({ status: 'error', error: msg });
      return;
    }

    // Phase 4: Assemble script DOCX (if enabled)
    if (scriptEnabled) {
      updateState({ progressLabel: 'Assembling script document…' });
      try {
        const docxRes = await fetch('/api/generate-script-docx', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: `Presenter Script — ${context?.subject ?? 'Presentation'}`,
            slides: allSlides.filter(s => !s.error).map(s => ({
              slideNumber: s.slideNumber,
              title: s.title,
              statements: s.statements,
              script: s.script ?? '',
            })),
          }),
        });

        if (!docxRes.ok) throw new Error('Script DOCX assembly failed');
        const docxData = await docxRes.json();
        completedSteps++;
        updateState({ scriptDocxBase64: docxData.docxBase64 });
      } catch {
        // non-fatal — PPTX still downloadable
      }
    }

    updateState({
      status: 'complete',
      progress: 100,
      progressLabel: 'Complete!',
    });
  }, [numSlides, slidesTitles, scriptEnabled, scriptWordsPerSlide, scriptInstructions, context, selectedReferences, data]);

  useEffect(() => {
    runGeneration();
    return () => { cancelledRef.current = true; };
  }, []);

  const isRunning = genState.status === 'generating-slides' || genState.status === 'generating-scripts' || genState.status === 'assembling';
  const isComplete = genState.status === 'complete';
  const isError = genState.status === 'error';

  const subject = context?.subject ?? 'Presentation';
  const filenameBase = slugify(subject);

  const handleDownloadPPTX = () => {
    if (genState.pptxBase64) {
      downloadBase64(genState.pptxBase64, `${filenameBase}-slides.pptx`, 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    }
  };

  const handleDownloadScript = () => {
    if (genState.scriptDocxBase64) {
      downloadBase64(genState.scriptDocxBase64, `${filenameBase}-script.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    }
  };

  const slideNumbers = Array.from({ length: numSlides }, (_, i) => i + 1);

  return (
    <div className="min-h-screen bg-[#F7F6F3] flex flex-col">

      {/* Header */}
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

      {/* Main */}
      <main className="flex-1 p-6">
        <div className="max-w-4xl mx-auto">

          <div className="mb-8">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Step 4 of 4</p>
            <h1 className="text-3xl font-bold text-gray-900">Generating Presentation</h1>
            <p className="text-sm text-gray-500 mt-1">
              {numSlides} slides{scriptEnabled ? ' + presenter script' : ''} — {subject}
            </p>
          </div>

          {/* Error banner */}
          {isError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
              <div className="flex gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-700">Generation failed</p>
                  <p className="text-xs text-red-600 mt-1">{genState.error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Progress card */}
          {(isRunning || isComplete) && (
            <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
              <div className="flex justify-between text-xs text-gray-500 mb-2">
                <span>{isComplete ? 'Complete!' : genState.progressLabel}</span>
                <span>{Math.round(genState.progress)}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1.5 mb-4">
                <div
                  className="h-1.5 bg-slate-900 rounded-full transition-all duration-500"
                  style={{ width: `${genState.progress}%` }}
                />
              </div>

              {/* Slide grid progress */}
              <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
                {slideNumbers.map(n => {
                  const slide = genState.generatedSlides[n];
                  const isCurrent = genState.currentSlideIndex === n && isRunning;
                  const isDone = !!slide;
                  const hasError = slide?.error;
                  return (
                    <div
                      key={n}
                      title={`Slide ${n}: ${slidesTitles[n - 1] ?? ''}`}
                      className={cn(
                        'h-6 rounded flex items-center justify-center text-[10px] font-bold transition-all',
                        hasError ? 'bg-red-100 text-red-600 border border-red-200' :
                        isDone   ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
                        isCurrent ? 'bg-slate-900 text-white animate-pulse' :
                        'bg-gray-100 text-gray-400 border border-gray-200'
                      )}
                    >
                      {n}
                    </div>
                  );
                })}
              </div>

              {isRunning && (
                <div className="flex items-center gap-2 mt-4">
                  <Loader2 className="w-4 h-4 animate-spin text-slate-600" />
                  <span className="text-xs text-gray-500">{genState.progressLabel}</span>
                </div>
              )}
            </div>
          )}

          {/* Download section */}
          {isComplete && genState.pptxBase64 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 mb-6">
              <div className="flex items-center gap-3 mb-4">
                <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                <div>
                  <p className="text-sm font-bold text-emerald-800">Presentation ready!</p>
                  <p className="text-xs text-emerald-600">
                    {genState.completedSlides} of {numSlides} slides generated successfully
                  </p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleDownloadPPTX}
                  className="flex items-center justify-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition-all shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  Download Presentation (PPTX)
                </button>
                {scriptEnabled && genState.scriptDocxBase64 && (
                  <button
                    onClick={handleDownloadScript}
                    className="flex items-center justify-center gap-2 px-5 py-3 bg-white hover:bg-gray-50 text-gray-900 text-sm font-bold rounded-xl border border-gray-200 transition-all"
                  >
                    <Download className="w-4 h-4" />
                    Download Presenter Script (Word)
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Generated slides preview */}
          {Object.keys(genState.generatedSlides).length > 0 && (
            <div className="space-y-4 mb-6">
              <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Slides Preview</h2>
              {slideNumbers.map(n => {
                const slide = genState.generatedSlides[n];
                if (!slide) return null;
                return (
                  <div key={n} className={cn(
                    'bg-white rounded-xl border p-5',
                    slide.error ? 'border-red-200' : 'border-gray-200'
                  )}>
                    <div className="flex items-start gap-3">
                      <span className="text-xs font-bold text-gray-400 w-6 flex-shrink-0 pt-0.5">{n}.</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-900 mb-2">{slide.title}</p>
                        {slide.error ? (
                          <p className="text-xs text-red-600 flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5" /> {slide.error}
                          </p>
                        ) : (
                          <ul className="space-y-1">
                            {slide.statements.map((stmt, i) => (
                              <li key={i} className="text-xs text-gray-600 flex gap-1.5">
                                <span className="text-gray-400 flex-shrink-0">•</span>
                                <span>{stmt}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                        {slide.script && (
                          <details className="mt-3">
                            <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600 select-none">
                              Presenter script
                            </summary>
                            <p className="text-xs text-gray-500 mt-2 leading-relaxed italic">{slide.script}</p>
                          </details>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Back button */}
          <div className="flex gap-3">
            <button
              onClick={onBack}
              disabled={isRunning}
              className={cn(
                'flex items-center gap-2 px-6 py-3 rounded-xl border border-gray-200 text-sm font-semibold transition-all',
                isRunning ? 'text-gray-400 cursor-not-allowed' : 'text-gray-900 hover:bg-gray-100'
              )}
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Outline
            </button>
          </div>

        </div>
      </main>
    </div>
  );
}
