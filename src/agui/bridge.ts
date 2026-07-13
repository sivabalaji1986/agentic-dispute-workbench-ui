import { applyPatch, type Operation } from 'fast-json-patch';
import type { AgentSubscriber } from '@ag-ui/client';
import { isA2uiCustomEvent, isProgressCustomEvent } from './events';
import { useWorkbenchStore } from '../state/workbenchStore';
import { preprocessUnknownComponents } from '../components/catalog/catalogInstance';
import type { A2uiComponentJson } from '../components/catalog/types';

let stateDoc: Record<string, unknown> = {};

export function resetBridgeState(): void {
  stateDoc = {};
}

function syncEvidenceReadiness(): void {
  const value = stateDoc.evidenceReadiness;
  useWorkbenchStore.getState().setEvidenceReadiness(typeof value === 'string' ? value : null);
}

function applyA2uiMessage(message: { version: 'v0.9'; [key: string]: unknown }): void {
  const processor = useWorkbenchStore.getState().processor;

  if ('createSurface' in message) {
    const surfaceId = (message.createSurface as { surfaceId: string }).surfaceId;
    if (processor.model.getSurface(surfaceId)) {
      console.warn(`A2UI: ignoring duplicate createSurface for existing surface ${surfaceId}`);
      return;
    }
    processor.processMessages([message as never]);
    return;
  }

  if ('updateComponents' in message) {
    const payload = message.updateComponents as {
      surfaceId: string;
      components: A2uiComponentJson[];
    };
    processor.processMessages([
      {
        version: 'v0.9',
        updateComponents: {
          surfaceId: payload.surfaceId,
          components: preprocessUnknownComponents(payload.components),
        },
      } as never,
    ]);
    return;
  }

  processor.processMessages([message as never]);
}

export const workbenchAgentSubscriber: AgentSubscriber = {
  onRunStartedEvent({ event }) {
    useWorkbenchStore.getState().setRunId(event.runId);
    useWorkbenchStore.getState().setConnectionStatus('streaming');
  },
  onRunFinishedEvent() {
    useWorkbenchStore.getState().setConnectionStatus('finished');
  },
  onRunErrorEvent() {
    useWorkbenchStore.getState().setConnectionStatus('disconnected');
  },
  onStateSnapshotEvent({ event }) {
    stateDoc = (event.snapshot as Record<string, unknown>) ?? {};
    syncEvidenceReadiness();
  },
  onStateDeltaEvent({ event }) {
    const result = applyPatch(stateDoc, event.delta as Operation[], true, false);
    stateDoc = result.newDocument;
    syncEvidenceReadiness();
  },
  onCustomEvent({ event }) {
    if (isProgressCustomEvent(event)) {
      useWorkbenchStore.getState().appendProgressLine(event.value.source, event.value.text);
      return;
    }
    if (isA2uiCustomEvent(event)) {
      applyA2uiMessage(event.value as { version: 'v0.9'; [key: string]: unknown });
    }
  },
};
