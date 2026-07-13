import { z } from 'zod';
import { CommonSchemas } from '@a2ui/web_core/v0_9';

export const DecisionCardApi = {
  name: 'DecisionCard',
  schema: z.object({
    status: CommonSchemas.DynamicString,
    disputeType: CommonSchemas.DynamicString,
    evidenceReadiness: CommonSchemas.DynamicString,
    recommendedAction: CommonSchemas.DynamicString,
    // Composition plumbing (design doc §4.1 addendum): DecisionCard is always
    // the surface root, and nests EvidenceChecklist/NextActions via A2UI's own
    // buildChild mechanism rather than a new layout component in the catalog.
    checklistId: z.string().optional(),
    actionsId: z.string().optional(),
  }),
};

export const EvidenceItemSchema = z.object({
  label: z.string(),
  present: z.boolean(),
});

export const EvidenceChecklistApi = {
  name: 'EvidenceChecklist',
  schema: z.object({
    items: z.array(EvidenceItemSchema),
  }),
};

export const NextActionItemSchema = z.object({
  id: z.string(),
  label: z.string(),
});

export const NextActionsApi = {
  name: 'NextActions',
  schema: z.object({
    actions: z.array(NextActionItemSchema),
  }),
};

export const ApprovalPreviewApi = {
  name: 'ApprovalPreview',
  schema: z.object({
    caseId: CommonSchemas.DynamicString,
    newCaseStatus: CommonSchemas.DynamicString,
    missingItems: z.array(z.string()),
    actionAfterApproval: CommonSchemas.DynamicString,
    onApprove: CommonSchemas.Action,
    onEdit: CommonSchemas.Action,
    onCancel: CommonSchemas.Action,
  }),
};

export const TaskCreatedCardApi = {
  name: 'TaskCreatedCard',
  schema: z.object({
    taskId: CommonSchemas.DynamicString,
    caseStatus: CommonSchemas.DynamicString,
    auditEntry: CommonSchemas.DynamicString,
    nextOwner: CommonSchemas.DynamicString,
  }),
};

export const UnknownComponentFallbackApi = {
  name: 'UnknownComponentFallback',
  schema: z.object({
    originalType: z.string(),
    raw: z.string(),
  }),
};
