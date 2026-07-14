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
  getLastDispatchedActionId: () => string | undefined = () => undefined,
): AgentSubscriber {
  let stateDoc: Record<string, unknown> = {};

  // The single place a rejected inbound payload becomes visible: it always
  // logs/notifies via onProtocolError *and* surfaces a WorkbenchError in the
  // store, regardless of what onProtocolError itself does — callers (tests,
  // WorkbenchSession) may layer additional behavior (e.g. console logging)
  // on top via onProtocolError, but the store's protocolError field is not
  // their responsibility to set.
  function reportProtocolError(failure: ValidationFailure): void {
    onProtocolError(failure);
    useWorkbenchStore.getState().setProtocolError({
      code:
        failure.eventType === 'a2ui' && failure.issuePath === 'version'
          ? 'unsupported_a2ui_version'
          : 'protocol_error',
      title: 'Protocol error',
      message: 'The server sent a payload this client could not understand.',
      retryable: false,
    });
  }

  function syncEvidenceReadiness(): void {
    const value = stateDoc.evidenceReadiness;
    useWorkbenchStore.getState().setEvidenceReadiness(typeof value === 'string' ? value : null);
  }

  function applyA2uiMessage(rawValue: unknown): void {
    const validated = validateA2uiMessage(rawValue);
    if (!validated.success) {
      reportProtocolError(validated.failure);
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
      const surface = processor.model.surfacesMap.values().next().value;
      const rootType = surface?.componentsModel.get('root')?.type;
      const status =
        rootType === 'ApprovalPreview'
          ? 'awaiting-approval'
          : rootType === 'TaskCreatedCard'
            ? 'completed'
            : getLastDispatchedActionId() === 'cancel_task_creation'
              ? 'cancelled'
              : 'idle';
      useWorkbenchStore.getState().setConnectionStatus(status);
    },
    onRunErrorEvent({ event }) {
      useWorkbenchStore.getState().setTransportError({
        code: event.code ?? 'run_error',
        title: 'Run failed',
        message: event.message,
        retryable: true,
        runId: useWorkbenchStore.getState().runId ?? undefined,
      });
      useWorkbenchStore.getState().setConnectionStatus('failed');
    },
    onRunFailed({ error }) {
      useWorkbenchStore.getState().setTransportError({
        code: 'sse_interrupted',
        title: 'Connection interrupted',
        message: error.message || 'The connection to the orchestrator was interrupted.',
        retryable: true,
      });
      useWorkbenchStore.getState().setConnectionStatus('failed');
    },
    onStateSnapshotEvent({ event }) {
      const validated = validateStateSnapshot(event.snapshot);
      if (!validated.success) {
        reportProtocolError(validated.failure);
        return;
      }
      stateDoc = validated.data;
      syncEvidenceReadiness();
    },
    onStateDeltaEvent({ event }) {
      const validated = validateStateDelta(event.delta);
      if (!validated.success) {
        reportProtocolError(validated.failure);
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
          reportProtocolError(validated.failure);
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
