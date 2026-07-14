import { applyPatch, type Operation } from 'fast-json-patch';
import type { AgentSubscriber } from '@ag-ui/client';
import type { MessageProcessor } from '@a2ui/web_core/v0_9';
import type { ReactComponentImplementation } from '@a2ui/react/v0_9';
import { isA2uiCustomEvent, isProgressCustomEvent } from './events';
import {
  validateProgressEventValue,
  validateA2uiMessage,
  validateStateSnapshot,
  validateStateDelta,
  logValidationFailure,
  type ValidationFailure,
} from './validation';
import { useWorkbenchStore } from '../state/workbenchStore';
import { preprocessUnknownComponents } from '../components/catalog/catalogInstance';

/**
 * Builds a fresh AG-UI subscriber bound to one session's own MessageProcessor
 * and RFC-6902 state document — both are closed over here, not module-level,
 * so two WorkbenchSessions never share state (see workbenchSession.ts).
 */
export function createWorkbenchAgentSubscriber(
  processor: MessageProcessor<ReactComponentImplementation>,
  onProtocolError: (failure: ValidationFailure) => void = logValidationFailure,
): AgentSubscriber {
  let stateDoc: Record<string, unknown> = {};

  function syncEvidenceReadiness(): void {
    const value = stateDoc.evidenceReadiness;
    useWorkbenchStore.getState().setEvidenceReadiness(typeof value === 'string' ? value : null);
  }

  function applyA2uiMessage(rawValue: unknown): void {
    const validated = validateA2uiMessage(rawValue);
    if (!validated.success) {
      onProtocolError(validated.failure);
      return;
    }
    const message = validated.data;

    if ('createSurface' in message) {
      const surfaceId = message.createSurface.surfaceId;
      if (processor.model.getSurface(surfaceId)) {
        console.warn(`A2UI: ignoring duplicate createSurface for existing surface ${surfaceId}`);
        return;
      }
      processor.processMessages([message]);
      return;
    }

    if ('updateComponents' in message) {
      processor.processMessages([
        {
          version: 'v0.9',
          updateComponents: {
            surfaceId: message.updateComponents.surfaceId,
            components: preprocessUnknownComponents(message.updateComponents.components as never),
          },
        },
      ]);
      return;
    }

    processor.processMessages([message]);
  }

  return {
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
    onRunFailed() {
      useWorkbenchStore.getState().setConnectionStatus('disconnected');
    },
    onStateSnapshotEvent({ event }) {
      const validated = validateStateSnapshot(event.snapshot);
      if (!validated.success) {
        onProtocolError(validated.failure);
        return;
      }
      stateDoc = validated.data;
      syncEvidenceReadiness();
    },
    onStateDeltaEvent({ event }) {
      const validated = validateStateDelta(event.delta);
      if (!validated.success) {
        onProtocolError(validated.failure);
        return;
      }
      const result = applyPatch(stateDoc, validated.data as Operation[], true, false);
      stateDoc = result.newDocument;
      syncEvidenceReadiness();
    },
    onCustomEvent({ event }) {
      if (isProgressCustomEvent(event)) {
        const validated = validateProgressEventValue(event.value);
        if (!validated.success) {
          onProtocolError(validated.failure);
          return;
        }
        useWorkbenchStore.getState().appendProgressLine(validated.data.source, validated.data.text);
        return;
      }
      if (isA2uiCustomEvent(event)) {
        applyA2uiMessage(event.value);
      }
    },
  };
}
