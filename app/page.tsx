import ThreePanelLayout from '@/components/layout/ThreePanelLayout';
import { LocalKeyGate } from '@/components/auth/LocalKeyGate';

export default function Home() {
  return (
    <LocalKeyGate>
      <ThreePanelLayout />
    </LocalKeyGate>
  );
}
