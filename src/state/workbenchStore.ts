import { create } from 'zustand';
import { MessageProcessor } from '@a2ui/web_core/v0_9';
import type { ReactComponentImplementation } from '@a2ui/react/v0_9';
import type { AgentSource } from '../agui/events';
import { disputeCatalog } from '../components/catalog/catalogInstance';
import { MAX_PROGRESS_LINES } from '../agui/validation';

export type ConnectionStatus =
  'idle' | 'connecting' | 'streaming' | 'awaiting-approval' | 'completed' | 'cancelled' | 'failed';

export interface WorkbenchError {
  code: string;
  title: string;
  message: string;
  retryable: boolean;
  runId?: string;
}

export interface ProgressLine {
  id: string;
  source: AgentSource | null; // null marks the one non-agent trim-marker row
  text: string;
  timestamp: number;
}

const TRIM_MARKER_TEXT = '— earlier entries trimmed —';

interface WorkbenchState {
  caseId: string | null;
  disputeText: string;
  threadId: string | null;
  runId: string | null;
  connectionStatus: ConnectionStatus;
  progressLines: ProgressLine[];
  evidenceReadiness: string | null;
  transportError: WorkbenchError | null;
  protocolError: WorkbenchError | null;
  processor: MessageProcessor<ReactComponentImplementation>;
  startCase: (params: { caseId: string; threadId: string; disputeText: string }) => void;
  setRunId: (runId: string) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  appendProgressLine: (source: AgentSource, text: string) => void;
  setEvidenceReadiness: (value: string | null) => void;
  setProcessor: (processor: MessageProcessor<ReactComponentImplementation>) => void;
  setTransportError: (error: WorkbenchError | null) => void;
  setProtocolError: (error: WorkbenchError | null) => void;
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
  transportError: null,
  protocolError: null,
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
      transportError: null,
      protocolError: null,
    }),

  setRunId: (runId) => set({ runId }),

  setConnectionStatus: (status) => set({ connectionStatus: status }),

  appendProgressLine: (source, text) =>
    set((state) => {
      const nextLine: ProgressLine = {
        id: `line-${++progressLineCounter}`,
        source,
        text,
        timestamp: Date.now(),
      };
      const hasMarker = state.progressLines[0]?.source === null;
      const realLines = hasMarker ? state.progressLines.slice(1) : state.progressLines;
      const nextReal = [...realLines, nextLine];

      if (nextReal.length <= MAX_PROGRESS_LINES) {
        const marker = hasMarker ? [state.progressLines[0]] : [];
        return { progressLines: [...marker, ...nextReal] };
      }

      const trimmedReal = nextReal.slice(nextReal.length - MAX_PROGRESS_LINES);
      const marker: ProgressLine = {
        id: 'trim-marker',
        source: null,
        text: TRIM_MARKER_TEXT,
        timestamp: 0,
      };
      return { progressLines: [marker, ...trimmedReal] };
    }),

  setEvidenceReadiness: (value) => set({ evidenceReadiness: value }),

  setProcessor: (processor) => set({ processor }),

  setTransportError: (error) => set({ transportError: error }),

  setProtocolError: (error) => set({ protocolError: error }),
}));
