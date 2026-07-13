import type { CustomEvent as AguiCustomEvent } from '@ag-ui/client';
import type { A2uiMessage } from '@a2ui/web_core/v0_9';

export type AgentSource = 'orchestrator' | 'case-review' | 'policy';

export interface ProgressEventValue {
  source: AgentSource;
  text: string;
}

export function isProgressCustomEvent(
  event: AguiCustomEvent,
): event is AguiCustomEvent & { value: ProgressEventValue } {
  return event.name === 'progress';
}

export function isA2uiCustomEvent(
  event: AguiCustomEvent,
): event is AguiCustomEvent & { value: A2uiMessage } {
  return event.name === 'a2ui';
}
