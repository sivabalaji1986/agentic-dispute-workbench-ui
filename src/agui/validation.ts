import { z } from 'zod';
import { A2uiMessageSchema, A2uiClientActionSchema } from '@a2ui/web_core/v0_9';
import {
  DecisionCardApi,
  EvidenceChecklistApi,
  EvidenceItemSchema,
  NextActionsApi,
  NextActionItemSchema,
  ApprovalPreviewApi,
  TaskCreatedCardApi,
} from '../components/catalog/schemas';

/**
 * Defensive caps on inbound protocol payloads — the load-bearing limits the
 * backend must respect. See the design doc's "Inbound payload validation"
 * amendment. Named here, nowhere else, so there is exactly one place to
 * change them.
 */
export const MAX_COMPONENTS_PER_UPDATE = 20;
export const MAX_CHECKLIST_ITEMS = 20;
export const MAX_ACTIONS = 10;
export const MAX_PROGRESS_TEXT = 500;

export const AgentSourceSchema = z.enum(['orchestrator', 'case-review', 'policy']);

export const ProgressEventValueSchema = z.object({
  source: AgentSourceSchema,
  text: z.string().min(1).max(MAX_PROGRESS_TEXT),
});

const SURFACE_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

type A2uiMessage = z.infer<typeof A2uiMessageSchema>;

function surfaceIdOf(message: A2uiMessage): string {
  if ('createSurface' in message) return message.createSurface.surfaceId;
  if ('updateComponents' in message) return message.updateComponents.surfaceId;
  if ('updateDataModel' in message) return message.updateDataModel.surfaceId;
  return message.deleteSurface.surfaceId;
}

// One source of truth per known component: the same schema the catalog
// itself renders against (src/components/catalog/schemas.ts), extended only
// with the array caps above. A component type outside this map is not
// rejected here — it falls through to preprocessUnknownComponents' fallback
// renderer (design doc §4.2), so validation must not block that path.
const KNOWN_COMPONENT_PROPS_SCHEMAS: Record<string, z.ZodTypeAny> = {
  DecisionCard: DecisionCardApi.schema,
  EvidenceChecklist: EvidenceChecklistApi.schema.extend({
    items: z.array(EvidenceItemSchema).max(MAX_CHECKLIST_ITEMS),
  }),
  NextActions: NextActionsApi.schema.extend({
    actions: z.array(NextActionItemSchema).max(MAX_ACTIONS),
  }),
  ApprovalPreview: ApprovalPreviewApi.schema,
  TaskCreatedCard: TaskCreatedCardApi.schema,
};

export interface ValidationFailure {
  eventType: string;
  issuePath: string;
}

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; failure: ValidationFailure };

function firstIssuePath(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return '(unknown)';
  return issue.path.length > 0 ? issue.path.join('.') : '(root)';
}

export function validateProgressEventValue(
  value: unknown,
): ValidationResult<z.infer<typeof ProgressEventValueSchema>> {
  const result = ProgressEventValueSchema.safeParse(value);
  if (result.success) return { success: true, data: result.data };
  return { success: false, failure: { eventType: 'progress', issuePath: firstIssuePath(result.error) } };
}

export function validateA2uiMessage(value: unknown): ValidationResult<A2uiMessage> {
  const base = A2uiMessageSchema.safeParse(value);
  if (!base.success) {
    return { success: false, failure: { eventType: 'a2ui', issuePath: firstIssuePath(base.error) } };
  }
  const message = base.data;

  if (!SURFACE_ID_PATTERN.test(surfaceIdOf(message))) {
    return { success: false, failure: { eventType: 'a2ui', issuePath: 'surfaceId' } };
  }

  if ('updateComponents' in message) {
    const { components } = message.updateComponents;
    if (components.length > MAX_COMPONENTS_PER_UPDATE) {
      return {
        success: false,
        failure: { eventType: 'a2ui', issuePath: 'updateComponents.components' },
      };
    }
    for (const component of components) {
      const propsSchema = KNOWN_COMPONENT_PROPS_SCHEMAS[component.component];
      if (!propsSchema) continue; // unknown type: handled by the fallback renderer downstream
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { component: _type, id: _id, weight: _weight, ...props } = component;
      const propsResult = propsSchema.safeParse(props);
      if (!propsResult.success) {
        return {
          success: false,
          failure: {
            eventType: 'a2ui',
            issuePath: `updateComponents.components[${component.component}].${firstIssuePath(propsResult.error)}`,
          },
        };
      }
    }
  }

  return { success: true, data: message };
}

const JsonPatchOpSchema = z.union([
  z.object({ op: z.enum(['add', 'replace', 'test']), path: z.string(), value: z.unknown() }),
  z.object({ op: z.literal('remove'), path: z.string() }),
  z.object({ op: z.enum(['move', 'copy']), path: z.string(), from: z.string() }),
]);

export const StateSnapshotSchema = z.record(z.unknown());
export const StateDeltaSchema = z.array(JsonPatchOpSchema);

export function validateStateSnapshot(
  value: unknown,
): ValidationResult<z.infer<typeof StateSnapshotSchema>> {
  const result = StateSnapshotSchema.safeParse(value);
  if (result.success) return { success: true, data: result.data };
  return {
    success: false,
    failure: { eventType: 'state_snapshot', issuePath: firstIssuePath(result.error) },
  };
}

export function validateStateDelta(
  value: unknown,
): ValidationResult<z.infer<typeof StateDeltaSchema>> {
  const result = StateDeltaSchema.safeParse(value);
  if (result.success) return { success: true, data: result.data };
  return {
    success: false,
    failure: { eventType: 'state_delta', issuePath: firstIssuePath(result.error) },
  };
}

export function validateForwardedAction(
  value: unknown,
): ValidationResult<z.infer<typeof A2uiClientActionSchema>> {
  const result = A2uiClientActionSchema.safeParse(value);
  if (result.success) return { success: true, data: result.data };
  return {
    success: false,
    failure: { eventType: 'forwarded_action', issuePath: firstIssuePath(result.error) },
  };
}

/**
 * Redacted by design: only the event type and the first offending Zod issue
 * path are logged, never the payload itself — see the design doc's "Inbound
 * payload validation" amendment.
 */
export function logValidationFailure(failure: ValidationFailure): void {
  console.warn(`[protocol] rejected ${failure.eventType} payload at ${failure.issuePath}`);
}
