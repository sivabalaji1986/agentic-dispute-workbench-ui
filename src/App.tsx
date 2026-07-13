import { CaseIntakePanel } from './components/CaseIntakePanel';
import { LiveProgressPanel } from './components/LiveProgressPanel';
import { DecisionPanel } from './components/DecisionPanel';

export default function App() {
  return (
    <div className="grid min-h-screen grid-cols-1 bg-paper text-ink xl:h-screen xl:grid-cols-12 xl:overflow-hidden">
      <div className="xl:col-span-3">
        <CaseIntakePanel />
      </div>
      <div className="xl:col-span-6">
        <LiveProgressPanel />
      </div>
      <div className="xl:col-span-3">
        <DecisionPanel />
      </div>
    </div>
  );
}
