import { useState, useRef } from 'react';
import { ArrowLeft, Download, Loader2, FileText, Sparkles, AlertCircle, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Screen3Data, GenerationState, SectionToGenerate, GeneratedSection } from '@/types';

interface Screen4Props {
  data: Screen3Data & { outlineText: string; tone?: string };
  onBack: () => void;
  onComplete?: () => void;
}

export default function Screen4({ data, onBack, onComplete }: Screen4Props) {
  const [generationState, setGenerationState] = useState<GenerationState>({
    status: 'idle',
    totalSections: 0,
    completedCount: 0,
    failedCount: 0,
    currentSection: '',
    currentSectionIndex: 0,
    generatedSections: {},
    progress: 0,
    progressLabel: '',
    error: null,
    failedSections: [],
    documentText: null,
    documentTitle: '',
    docxBase64: null,
  });

  const [formattingConfirmed, setFormattingConfirmed] = useState(false);
  const [generatedReferencesText, setGeneratedReferencesText] = useState('');
  const [isGeneratingReferences, setIsGeneratingReferences] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // Parse outline text into sections
  const parseOutlineSections = (outlineText: string): SectionToGenerate[] => {
    const regex = /^(\d+)\.\s+(.+?)\s*\(~?(\d+)\s*words?\)$/gm;
    const sections: SectionToGenerate[] = [];
    let match;
    let index = 1;

    // Extract section metadata
    while ((match = regex.exec(outlineText)) !== null) {
      const sectionName = match[2].trim();
      const wordCount = parseInt(match[3], 10);

      // Extract description (next 2 lines after heading)
      const sectionStart = match.index + match[0].length;
      const remainingText = outlineText.substring(sectionStart);
      const descriptionMatch = remainingText.match(/\n\s{2,}(.+?)\n/);
      const description = descriptionMatch ? descriptionMatch[1].trim() : '';

      // Extract citation guidance
      const citationMatch = remainingText.match(/Cite:\s+(.+?)(?:\n|$)/);
      const citationGuidance = citationMatch ? citationMatch[1].trim() : '';

      sections.push({
        name: sectionName,
        wordCount,
        index,
        description,
        citationGuidance,
      });
      index++;
    }

    return sections;
  };

  // Generate a single section
  const generateSection = async (section: SectionToGenerate): Promise<GeneratedSection | null> => {
    try {
      const response = await fetch('/api/generate-section', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sectionName: section.name,
          sectionDescription: section.description,
          wordCount: section.wordCount,
          sectionIndex: section.index,
          totalSections: generationState.totalSections,
          briefContext: data.briefContext,
          selectedReferences: data.selectedReferences,
          citationGuidance: section.citationGuidance,
          referenceStyle: data.briefContext.detectedReferenceStyle || 'APA 7',
          tone,
          formatSettings,
          outlineFullText: data.outlineText,
          selectedModel: data.selectedModel || 'haiku',
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(err.error ?? `Server error ${response.status}`);
      }

      const result = await response.json();
      return {
        sectionName: section.name,
        content: result.content,
        wordCount: result.wordCount,
        inTextCitations: result.inTextCitations,
        timestamp: new Date().toISOString(),
        retryCount: 0,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      return null;
    }
  };

  // Generate formatted references list
  const generateReferences = async (): Promise<string> => {
    try {
      setIsGeneratingReferences(true);
      const response = await fetch('/api/generate-references', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedReferences: data.selectedReferences,
          referenceStyle: data.briefContext.detectedReferenceStyle || 'APA 7',
          selectedModel: data.selectedModel || 'haiku',
        }),
      });

      if (!response.ok) {
        throw new Error(`Server error ${response.status}`);
      }

      const result = await response.json();
      return result.formattedText || '';
    } catch (err) {
      console.error('Reference generation error:', err);
      return '';
    } finally {
      setIsGeneratingReferences(false);
    }
  };

  // Main document generation with sequential sections
  const handleGenerateDocument = async () => {
    setGenerationState(s => ({
      ...s,
      status: 'generating',
      progress: 0,
      error: null,
      failedSections: [],
      failedCount: 0,
      completedCount: 0,
      generatedSections: {},
    }));

    // Parse sections from outline
    const sections = parseOutlineSections(data.outlineText);
    setGenerationState(s => ({
      ...s,
      totalSections: sections.length,
    }));

    // Collect generated sections in local variable (avoid React state batching issues)
    const collectedSections: { [name: string]: GeneratedSection } = {};
    const failedSectionsList: string[] = [];

    // Generate each section sequentially
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];

      // Update UI before generation
      setGenerationState(s => ({
        ...s,
        currentSectionIndex: i + 1,
        currentSection: section.name,
        progress: (i / sections.length) * 100,
        progressLabel: `Generating section ${i + 1} of ${sections.length}: ${section.name}`,
      }));

      // Generate section
      const generatedSection = await generateSection(section);

      if (generatedSection) {
        // Store in local variable
        collectedSections[section.name] = generatedSection;

        // Update UI
        setGenerationState(s => ({
          ...s,
          generatedSections: {
            ...s.generatedSections,
            [section.name]: generatedSection,
          },
          completedCount: i + 1,
          progress: ((i + 1) / sections.length) * 100,
        }));
      } else {
        // Mark as failed
        failedSectionsList.push(section.name);
        setGenerationState(s => ({
          ...s,
          failedSections: [...s.failedSections, section.name],
          failedCount: s.failedCount + 1,
          error: `Failed to generate "${section.name}"`,
        }));
      }
    }

    // Assembly phase: combine sections + generate DOCX
    setGenerationState(s => ({
      ...s,
      progressLabel: 'Assembling document and generating References...',
      progress: 95,
    }));

    await assembleDocument(sections, collectedSections, failedSectionsList);
  };

  // Assemble final document
  const assembleDocument = async (
    sections: SectionToGenerate[],
    collectedSections: { [name: string]: GeneratedSection },
    failedSectionsList: string[]
  ) => {
    try {
      // Generate references
      setGenerationState(s => ({
        ...s,
        progressLabel: 'Generating References section...',
        progress: 96,
      }));

      const referencesText = await generateReferences();
      setGeneratedReferencesText(referencesText);

      // Prepare sections array in order (skip failed ones)
      const orderedSections = sections
        .filter(s => !failedSectionsList.includes(s.name))
        .map(s => ({
          sectionName: s.name,
          content: collectedSections[s.name]?.content || '[Generation skipped]',
          index: s.index,
          wordCount: collectedSections[s.name]?.wordCount || 0,
        }));

      // Call assembly endpoint
      const response = await fetch('/api/generate-docx-from-sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `${data.briefContext.subject || 'Document'} - ${data.briefContext.taskType || 'Assignment'}`,
          briefContext: data.briefContext,
          generatedSections: orderedSections,
          selectedReferences: data.selectedReferences,
          referenceStyle: data.briefContext.detectedReferenceStyle || 'APA 7',
          formatSettings,
        }),
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const result = await response.json();

      setGenerationState(s => ({
        ...s,
        status: 'complete',
        documentTitle: result.title,
        docxBase64: result.docxBase64,
        progress: 100,
        progressLabel: 'Done! Ready to download.',
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setGenerationState(s => ({
        ...s,
        status: 'error',
        error: `Failed to assemble document: ${msg}`,
      }));
    }
  };

  // Download DOCX
  const handleDownloadDocx = () => {
    if (!generationState.docxBase64) return;

    try {
      const binaryString = atob(generationState.docxBase64);
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

  // Retry failed section
  const retrySection = async (sectionName: string) => {
    const sections = parseOutlineSections(data.outlineText);
    const section = sections.find(s => s.name === sectionName);
    if (!section) return;

    setGenerationState(s => ({
      ...s,
      progressLabel: `Retrying: ${sectionName}...`,
    }));

    const generatedSection = await generateSection(section);
    if (generatedSection) {
      setGenerationState(s => ({
        ...s,
        generatedSections: {
          ...s.generatedSections,
          [sectionName]: generatedSection,
        },
        failedSections: s.failedSections.filter(name => name !== sectionName),
        failedCount: Math.max(0, s.failedCount - 1),
        completedCount: s.completedCount + 1,
      }));
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
              <div
                className={cn(
                  'w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-all',
                  step < 4 ? 'bg-emerald-500 text-white' : step === 4 ? 'bg-slate-900 text-white' : 'bg-gray-200 text-gray-400'
                )}
              >
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

          {/* Formatting Settings Card */}
          {!formattingConfirmed && generationState.status === 'idle' && (
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

          {/* Progress Bar */}
          {generationState.progress > 0 && generationState.status !== 'idle' && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-6">
              <div className="flex justify-between text-xs text-gray-500 mb-2">
                <span className="font-semibold">{generationState.progressLabel}</span>
                <span className="font-mono">
                  {generationState.completedCount} / {generationState.totalSections} sections
                </span>
              </div>

              {/* Multi-step progress indicator */}
              <div className="flex gap-2 mb-3">
                {Array.from({ length: Math.max(1, generationState.totalSections) }).map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      'flex-1 h-1 rounded-full transition-all',
                      i < generationState.completedCount ? 'bg-emerald-500' :
                      i === generationState.currentSectionIndex - 1 ? 'bg-blue-500 animate-pulse' :
                      'bg-gray-200'
                    )}
                  />
                ))}
              </div>

              {/* Main progress bar */}
              <div className="w-full bg-gray-200 rounded-full h-0.5 mb-2">
                <div
                  className="h-0.5 bg-slate-900 rounded-full transition-all duration-300"
                  style={{ width: `${generationState.progress}%` }}
                />
              </div>

              <div className="text-xs text-gray-500">{Math.round(generationState.progress)}% complete</div>
            </div>
          )}

          {/* Document Generation Section */}
          {generationState.status === 'idle' && formattingConfirmed ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
              <h3 className="text-lg font-bold text-gray-900 mb-2">Generate Full Document</h3>
              <p className="text-sm text-gray-600 mb-6">
                Generates document section by section. Each section is created independently with proper citations and then combined into a final formatted Word document.
              </p>
              <button
                onClick={handleGenerateDocument}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-slate-900 text-white hover:bg-slate-800 font-semibold transition-all"
              >
                <FileText className="w-4 h-4" />
                Generate Full Document
              </button>
            </div>
          ) : null}

          {/* Real-time Generated Content Display */}
          {generationState.status === 'generating' && Object.keys(generationState.generatedSections).length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
              <h2 className="text-2xl font-bold text-black mb-6">
                {data.briefContext.subject || 'Document'} - {data.briefContext.taskType || 'Assignment'}
              </h2>

              {/* Display all completed sections */}
              {Object.entries(generationState.generatedSections).map(([sectionName, section]) => (
                <div key={sectionName} className="mb-8">
                  <h3 className="text-lg font-bold text-black mb-4">{sectionName}</h3>
                  <div className="text-black leading-relaxed whitespace-pre-wrap text-justify">
                    {section.content}
                  </div>
                </div>
              ))}

              {/* References being generated or completed */}
              {(generatedReferencesText || isGeneratingReferences) && (
                <div className="mt-10 pt-8 border-t border-gray-300">
                  <h3 className="text-lg font-bold text-black mb-4">References</h3>
                  {isGeneratingReferences ? (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generating References...
                    </div>
                  ) : (
                    <div className="text-black leading-relaxed whitespace-pre-wrap">
                      {generatedReferencesText}
                    </div>
                  )}
                </div>
              )}

              {/* Current generating section indicator */}
              {generationState.currentSectionIndex > Object.keys(generationState.generatedSections).length && (
                <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-800">
                    <span className="font-semibold">Currently generating:</span> {generationState.currentSection}...
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Final Document Display - After Generation Complete */}
          {generationState.status === 'complete' && Object.keys(generationState.generatedSections).length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
              <h2 className="text-2xl font-bold text-black mb-6">
                {data.briefContext.subject || 'Document'} - {data.briefContext.taskType || 'Assignment'}
              </h2>

              {/* Display all sections */}
              {Object.entries(generationState.generatedSections).map(([sectionName, section]) => (
                <div key={sectionName} className="mb-8">
                  <h3 className="text-lg font-bold text-black mb-4">{sectionName}</h3>
                  <div className="text-black leading-relaxed whitespace-pre-wrap text-justify">
                    {section.content}
                  </div>
                </div>
              ))}

              {/* References Section */}
              {generatedReferencesText && (
                <div className="mt-10 pt-8 border-t border-gray-300">
                  <h3 className="text-lg font-bold text-black mb-4">References</h3>
                  <div className="text-black leading-relaxed whitespace-pre-wrap">
                    {generatedReferencesText}
                  </div>
                </div>
              )}

              {/* References Loading State */}
              {isGeneratingReferences && (
                <div className="mt-10 pt-8 border-t border-gray-300">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating References...
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error State */}
          {generationState.failedSections.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <h3 className="font-semibold text-red-900 mb-3 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                Some Sections Failed
              </h3>
              {generationState.failedSections.map(name => (
                <div key={name} className="flex justify-between items-center mb-2">
                  <span className="text-sm text-red-700">{name}</span>
                  <button
                    onClick={() => retrySection(name)}
                    className="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Retry
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Success State - Download Button */}
          {generationState.status === 'complete' && generationState.docxBase64 && (
            <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900">Document Ready</h3>
                <span className="text-xs text-gray-500 bg-emerald-100 px-3 py-1 rounded-full text-emerald-700">
                  ✓ {generationState.totalSections} sections + references
                </span>
              </div>
              <button
                onClick={handleDownloadDocx}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-slate-900 text-white hover:bg-slate-800 font-semibold transition-all"
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
            {onComplete && generationState.status === 'complete' && (
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
