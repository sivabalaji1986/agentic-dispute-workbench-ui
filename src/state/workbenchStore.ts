import { create } from 'zustand';
import { MessageProcessor } from '@a2ui/web_core/v0_9';
import type { ReactComponentImplementation } from '@a2ui/react/v0_9';
import type { AgentSource } from '../agui/events';
import { disputeCatalog } from '../components/catalog/catalogInstance';

export type ConnectionStatus = 'idle' | 'connecting' | 'streaming' | 'disconnected' | 'finished';

export interface ProgressLine {
  id: string;
  source: AgentSource;
  text: string;
  timestamp: number;
}

interface WorkbenchState {
  caseId: string | null;
  disputeText: string;
  threadId: string | null;
  runId: string | null;
  connectionStatus: ConnectionStatus;
  progressLines: ProgressLine[];
  evidenceReadiness: string | null;
  processor: MessageProcessor<ReactComponentImplementation>;
  startCase: (params: { caseId: string; threadId: string; disputeText: string }) => void;
  setRunId: (runId: string) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  appendProgressLine: (source: AgentSource, text: string) => void;
  setEvidenceReadiness: (value: string | null) => void;
}

let progressLineCounter = 0;

export const useWorkbenchStore = create<WorkbenchState>((set) => ({
  caseId: null,
  disputeText: '',
  threadId: null,
  runId: null,
  connectionStatus: 'idle',
  progressLines: [],
  evidenceReadiness: null,
  processor: new MessageProcessor<ReactComponentImplementation>([disputeCatalog]),

  startCase: ({ caseId, threadId, disputeText }) =>
    set({
      caseId,
      threadId,
      disputeText,
      runId: null,
      connectionStatus: 'connecting',
      progressLines: [],
      evidenceReadiness: null,
    }),

  setRunId: (runId) => set({ runId }),

  setConnectionStatus: (status) => set({ connectionStatus: status }),

  appendProgressLine: (source, text) =>
    set((state) => ({
      progressLines: [
        ...state.progressLines,
        { id: `line-${++progressLineCounter}`, source, text, timestamp: Date.now() },
      ],
    })),

  setEvidenceReadiness: (value) => set({ evidenceReadiness: value }),
}));
