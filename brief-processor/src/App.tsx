import { useState } from 'react';
import Screen1, { Screen1Data } from '@/components/Screen1';
import Screen2 from '@/components/Screen2';
import Screen3 from '@/components/Screen3';
import Screen4 from '@/components/Screen4';
import ComingSoon from '@/components/ComingSoon';
import { Reference } from '@/types';

export default function App() {
  const [screen, setScreen]                           = useState(1);
  const [appData, setAppData]                         = useState<Screen1Data | null>(null);
  const [selectedReferences, setSelectedReferences]   = useState<Reference[]>([]);
  const [selectedReferenceIds, setSelectedReferenceIds] = useState<Set<string>>(new Set());
  const [outlineText, setOutlineText]                 = useState('');

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
        onContinue={(text) => {
          setOutlineText(text);
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
