export type ReferenceStyle =
  | 'auto-detect'
  | 'apa7'
  | 'apa6'
  | 'mla9'
  | 'chicago17'
  | 'harvard'
  | 'ieee'
  | 'vancouver'
  | 'oxford'
  | 'oscola';

export type WordLimit =
  | 'auto-detect'
  | '500'
  | '750'
  | '1000'
  | '1500'
  | '2000'
  | '2500'
  | '3000'
  | '4000'
  | '5000'
  | '7500'
  | '10000';

export type SupportMaterialType =
  | 'case-study'
  | 'reading-list'
  | 'lecture-notes'
  | 'previous-feedback'
  | 'module-handbook'
  | 'other';

export interface SupportMaterial {
  type: SupportMaterialType;
  label: string;
  enabled: boolean;
  inputMode: 'file' | 'text';
  text: string;
  files: UploadedFile[];
}

export interface UploadedFile {
  file: File;
  name: string;
  size: number;
  type: string;
  preview?: string;
}

export interface OutlineSection {
  section: string;
  wordCount: number;
  points: string[];
}

export type SourceType =
  // Academic
  | 'article' | 'book' | 'dissertation' | 'conference-paper' | 'report'
  // Non-academic
  | 'news' | 'blog' | 'government' | 'industry';

export interface SearchFilters {
  // Academic source types
  includeArticles: boolean;
  includeBooks: boolean;
  includeConferencePapers: boolean;
  includeDissertations: boolean;
  includeReports: boolean;
  // Non-academic credible sources
  includeNews: boolean;
  includeBlogs: boolean;
  includeGovernment: boolean;
  includeIndustry: boolean;
  // Quality filters
  fullTextOnly: boolean;
  peerReviewedOnly: boolean;
  languageEnglishOnly: boolean;
  // Time & quantity
  yearFrom: number;
  yearTo: number;
  maxResults: number;
  // Custom search instructions
  extraSearchInstructions?: string;
}

export interface Reference {
  id: string;
  title: string;
  authors: string[];
  year: number;
  sourceName: string;
  doi?: string;
  url?: string;
  type: SourceType;
  isOpenAccess: boolean;
  citationCount: number;
  annotation: string;
  formattedReference: string;
  aiGenerated?: boolean;
  // Verification metadata for non-academic sources
  verified?: boolean;
  verificationMethod?: 'api' | 'web-search' | 'ai-generated';
  urlVerified?: boolean;
}

export interface EnhancedOutlineSection extends OutlineSection {
  description: string;  // 100-150 words per section
  referenceMappings: {
    referenceIndices: number[];  // Indices into selectedReferences array
    guidance: string;  // How to use these sources
  };
}

export interface EnhancedOutline {
  outline?: string;  // Condensed outline text (simplified format)
  sections?: EnhancedOutlineSection[];  // Optional: for backwards compatibility
  overallGuidance?: string;  // Optional: Overall integration strategy
  wordAllocation: Record<string, number>;  // section name → word count
}

export interface Screen3Data {
  files: UploadedFile[];
  briefText: string;
  supportMaterials: SupportMaterial[];
  extraInstructions: string;
  referenceStyle: ReferenceStyle;
  wordLimit: WordLimit;
  briefContext: BriefContext;
  currentScreen: number;
  selectedReferences: Reference[];
  selectedReferenceIds: Set<string>;
}

export interface BriefContext {
  detectedReferenceStyle?: ReferenceStyle;
  detectedWordLimit?: number;
  subject?: string;
  taskType?: string;
  keywords?: string[];
  outline?: OutlineSection[];
  summary?: string;
  analysisComplete: boolean;
  analysisProgress: number;
}

export interface ProjectState {
  // Screen 1
  briefMode: 'file' | 'text';
  briefText: string;
  uploadedFiles: UploadedFile[];
  supportMaterials: SupportMaterial[];
  extraInstructions: string;
  referenceStyle: ReferenceStyle;
  wordLimit: WordLimit;
  briefContext: BriefContext;
  currentScreen: number;
}
