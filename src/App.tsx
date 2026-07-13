import { CaseIntakePanel } from './components/CaseIntakePanel';
import { LiveProgressPanel } from './components/LiveProgressPanel';
import { DecisionPanel } from './components/DecisionPanel';

export default function App() {
  return (
    <div className="grid h-screen grid-cols-[320px_1fr_1fr] bg-slate-100 text-slate-900">
      <CaseIntakePanel />
      <LiveProgressPanel />
      <DecisionPanel />
    </div>
  );
}
