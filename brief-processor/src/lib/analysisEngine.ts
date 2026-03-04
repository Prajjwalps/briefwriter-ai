import { BriefContext, ReferenceStyle, SupportMaterial, OutlineSection } from '@/types';

interface AnalysisResult {
  referenceStyle: string | null;
  wordLimit: number | null;
  subject: string | null;
  taskType: string | null;
  keywords: string[];
  outline?: OutlineSection[];
  briefDraft?: string;
  summary: string;
}

export interface AnalysisInput {
  files: File[];
  briefText: string;
  supportMaterials: SupportMaterial[];
  extraInstructions: string;
}

export async function analyzeContent(
  input: AnalysisInput,
  onProgress: (progress: number) => void
): Promise<Partial<BriefContext>> {
  onProgress(5);

  const formData = new FormData();

  // Brief files (file mode)
  for (const file of input.files) {
    formData.append('files', file);
  }

  // Brief text (text mode) — sent as a virtual plain-text file
  if (input.briefText.trim()) {
    const blob = new Blob([input.briefText], { type: 'text/plain' });
    formData.append('files', blob, 'brief.txt');
  }

  // Support materials
  for (const mat of input.supportMaterials) {
    if (!mat.enabled) continue;
    if (mat.inputMode === 'file') {
      for (const uf of mat.files) {
        formData.append('files', uf.file);
      }
    } else if (mat.text.trim()) {
      const blob = new Blob(
        [`[${mat.label}]\n\n${mat.text}`],
        { type: 'text/plain' }
      );
      formData.append('files', blob, `${mat.type}.txt`);
    }
  }

  // Extra instructions
  if (input.extraInstructions.trim()) {
    formData.append('extraInstructions', input.extraInstructions.trim());
  }

  onProgress(15);

  const response = await fetch('/api/analyse', {
    method: 'POST',
    body: formData,
  });

  onProgress(60);

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(err.error ?? `Server error ${response.status}`);
  }

  const result: AnalysisResult = await response.json();
  onProgress(90);

  // Convert briefDraft to structured outline if outline is empty
  let outline = result.outline ?? [];

  if (outline.length === 0 && result.briefDraft && result.wordLimit) {
    // Generate a structured outline based on task type
    const totalWords = result.wordLimit;
    const sections: OutlineSection[] = [];

    // Create standard essay structure with proportional word counts
    if (result.taskType === 'Essay' || result.taskType === 'Research Paper') {
      const introWords = Math.floor(totalWords * 0.15);
      const bodyWords = Math.floor(totalWords * 0.70 / 2); // 2 main body sections
      const conclusionWords = totalWords - (introWords + bodyWords * 2);

      sections.push({
        section: 'Introduction',
        wordCount: introWords,
        points: [
          'Hook and context setting',
          'Problem statement and significance',
          'Thesis statement and scope'
        ]
      });

      sections.push({
        section: 'Main Analysis & Impacts',
        wordCount: bodyWords,
        points: [
          'Primary effects and mechanisms',
          'Evidence and case studies',
          'Impact quantification'
        ]
      });

      sections.push({
        section: 'Solutions & Adaptation Strategies',
        wordCount: bodyWords,
        points: [
          'Current mitigation approaches',
          'Practical implementation methods',
          'Effectiveness evaluation'
        ]
      });

      sections.push({
        section: 'Conclusion',
        wordCount: conclusionWords,
        points: [
          'Summary of key findings',
          'Policy recommendations',
          'Future research directions'
        ]
      });
    } else {
      // Fallback for other task types: create a generic outline
      const sectionWords = Math.floor(totalWords / 3);
      sections.push({
        section: 'Introduction',
        wordCount: sectionWords,
        points: ['Key concepts', 'Background', 'Objectives']
      });
      sections.push({
        section: 'Main Content',
        wordCount: sectionWords,
        points: ['Primary arguments', 'Evidence', 'Analysis']
      });
      sections.push({
        section: 'Conclusion',
        wordCount: totalWords - (sectionWords * 2),
        points: ['Summary', 'Implications', 'Next steps']
      });
    }

    outline = sections;
  }

  const mapped: Partial<BriefContext> = {
    detectedReferenceStyle: (result.referenceStyle as ReferenceStyle) ?? undefined,
    detectedWordLimit:      result.wordLimit ?? undefined,
    subject:                result.subject ?? undefined,
    taskType:               result.taskType ?? undefined,
    keywords:               result.keywords ?? [],
    outline:                outline,
    summary:                result.summary ?? '',
    analysisComplete:       true,
    analysisProgress:       100,
  };

  onProgress(100);
  return mapped;
}
