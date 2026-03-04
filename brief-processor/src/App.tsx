import { useState } from 'react';
import Screen1, { Screen1Data } from '@/components/Screen1';
import Screen2 from '@/components/Screen2';
import Screen3 from '@/components/Screen3';
import Screen4 from '@/components/Screen4';
import ComingSoon from '@/components/ComingSoon';
import { Reference } from '@/types';

// ─── TEST MODE ───────────────────────────────────────────────────────────────
// Read from a global set in index.html BEFORE React loads — prevents Parcel from
// tree-shaking the mock data via dead-code elimination of a compile-time constant.
const TEST_MODE: boolean = (window as any).__BW_TEST__ === 'screen3';

const MOCK_APP_DATA: Screen1Data = {
  briefMode: 'text',
  briefText: 'Critically analyse the impact of social media on mental health in adolescents. Discuss both positive and negative effects, drawing on empirical research. 2000 words. APA7.',
  uploadedFiles: [],
  supportMaterials: [],
  extraInstructions: '',
  referenceStyle: 'apa7',
  wordLimit: '2000',
  context: {
    detectedReferenceStyle: 'apa7',
    detectedWordLimit: 2000,
    subject: 'Impact of social media on adolescent mental health',
    taskType: 'Critical Analysis',
    keywords: ['social media', 'mental health', 'adolescents', 'empirical research', 'wellbeing'],
    outline: [
      { section: 'Introduction',            wordCount: 200, points: ['Define social media', 'State thesis'] },
      { section: 'Negative Effects',        wordCount: 700, points: ['Anxiety', 'Depression', 'Cyberbullying'] },
      { section: 'Positive Effects',        wordCount: 500, points: ['Social connection', 'Support networks'] },
      { section: 'Critical Evaluation',     wordCount: 400, points: ['Research gaps', 'Methodological issues'] },
      { section: 'Conclusion',              wordCount: 200, points: ['Summary', 'Recommendations'] },
    ],
    summary: 'A critical analysis of social media\'s dual impact on adolescent mental health, examining both negative effects (anxiety, depression, cyberbullying) and positive aspects (social connection, support networks), with reference to empirical research.',
    analysisComplete: true,
    analysisProgress: 100,
  },
};

const MOCK_REFERENCES: Reference[] = [
  {
    id: 'ref1',
    title: 'Social media use and adolescent mental health: Findings from the UK Millennium Cohort Study',
    authors: ['Viner, R. M.', 'Aswathikutty-Gireesh, A.', 'Stiglic, N.'],
    year: 2019,
    sourceName: 'EClinicalMedicine',
    doi: '10.1016/j.eclinm.2019.08.011',
    type: 'article',
    isOpenAccess: true,
    citationCount: 412,
    annotation: 'This longitudinal cohort study examines the relationship between social media use and mental health outcomes in UK adolescents, finding significant associations between high usage and depression and anxiety, particularly in girls.',
    formattedReference: 'Viner, R. M., Aswathikutty-Gireesh, A., & Stiglic, N. (2019). Social media use and adolescent mental health. EClinicalMedicine, 13, 47–56.',
  },
  {
    id: 'ref2',
    title: 'Associations between screen time and lower psychological well-being among children and adolescents',
    authors: ['Twenge, J. M.', 'Campbell, W. K.'],
    year: 2019,
    sourceName: 'Preventive Medicine Reports',
    doi: '10.1016/j.pmedr.2018.10.003',
    type: 'article',
    isOpenAccess: false,
    citationCount: 298,
    annotation: 'Twenge and Campbell analyse large-scale survey data linking higher screen time to reduced wellbeing, providing key empirical evidence for the negative effects argument.',
    formattedReference: 'Twenge, J. M., & Campbell, W. K. (2019). Associations between screen time and lower psychological well-being. Preventive Medicine Reports, 12, 271–283.',
  },
  {
    id: 'ref3',
    title: 'Online social networking and mental health',
    authors: ['Fardouly, J.', 'Vartanian, L. R.'],
    year: 2015,
    sourceName: 'Cyberpsychology, Behavior, and Social Networking',
    doi: '10.1089/cyber.2014.0258',
    type: 'article',
    isOpenAccess: false,
    citationCount: 521,
    annotation: 'A systematic review exploring social comparison mechanisms on platforms like Instagram and their contribution to body image dissatisfaction and lowered self-esteem in adolescent users.',
    formattedReference: 'Fardouly, J., & Vartanian, L. R. (2015). Online social networking and mental health. Cyberpsychology, Behavior, and Social Networking, 18(5), 285–290.',
  },
];
// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen]                           = useState(TEST_MODE ? 3 : 1);
  const [appData, setAppData]                         = useState<Screen1Data | null>(TEST_MODE ? MOCK_APP_DATA : null);
  const [selectedReferences, setSelectedReferences]   = useState<Reference[]>(TEST_MODE ? MOCK_REFERENCES : []);
  const [selectedReferenceIds, setSelectedReferenceIds] = useState<Set<string>>(TEST_MODE ? new Set(['ref1','ref2','ref3']) : new Set());
  const [outlineText, setOutlineText]                 = useState('');
  const [outlineTone, setOutlineTone]                 = useState('Academic');

  const handleScreen1Continue = (data: Screen1Data) => {
    setAppData(data);
    setScreen(2);
  };

  if (screen === 1 || !appData) {
    return <Screen1 onContinue={handleScreen1Continue} />;
  }

  if (screen === 2) {
    return (
      <Screen2
        data={appData}
        onBack={() => setScreen(1)}
        onContinue={(refs, refIds) => {
          setSelectedReferences(refs);
          setSelectedReferenceIds(refIds);
          setScreen(3);
        }}
      />
    );
  }

  if (screen === 3 && appData) {
    return (
      <Screen3
        data={{
          ...appData,
          briefContext: appData.context,
          selectedReferences,
          selectedReferenceIds,
        }}
        onBack={() => setScreen(2)}
        onContinue={(text, tone) => {
          setOutlineText(text);
          setOutlineTone(tone);
          setScreen(4);
        }}
      />
    );
  }

  // Screen 4 - Final Outline
  if (screen === 4 && appData) {
    return (
      <Screen4
        data={{
          ...appData,
          briefContext: appData.context,
          selectedReferences,
          selectedReferenceIds,
          outlineText,
          tone: outlineTone,
        }}
        onBack={() => setScreen(3)}
        onComplete={() => {
          // Handle completion - could save to database, generate draft, etc.
          alert('Outline finalized! Ready for next steps.');
        }}
      />
    );
  }

  return (
    <ComingSoon
      screenNumber={4}
      title="Draft Generation"
      data={appData}
      onBack={() => setScreen(3)}
    />
  );
}
