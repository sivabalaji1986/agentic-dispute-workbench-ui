/**
 * The frozen set of action ids the client will ever dispatch. Labels are
 * display-only and never gate dispatch — only the id does. See the design
 * doc's "Action-ID allow-list" amendment: the backend may not invent new
 * action ids without a spec change.
 */
export const DISPATCHABLE_ACTION_IDS = [
  'create_evidence_request_task',
  'approve_task_creation',
  'cancel_task_creation',
  'escalate_to_reviewer',
  'save_case_note',
] as const;

export type DispatchableActionId = (typeof DISPATCHABLE_ACTION_IDS)[number];

export function isDispatchableActionId(id: string): id is DispatchableActionId {
  return (DISPATCHABLE_ACTION_IDS as readonly string[]).includes(id);
}
