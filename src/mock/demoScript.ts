import { EventType } from '@ag-ui/client';
import type { BaseEvent, CustomEvent } from '@ag-ui/client';
import type { AgentSource } from '../agui/events';
import { DISPUTE_CATALOG_ID } from '../components/catalog/catalogInstance';
import type { A2uiComponentJson } from '../components/catalog/types';

export interface ScriptedEvent {
  delayMs: number;
  event: BaseEvent;
}

export interface DemoRun {
  events: ScriptedEvent[];
}

export const CASE_ID = 'D-10291';
export const THREAD_ID = 'demo-thread-d-10291';
export const SURFACE_ID = `case-${CASE_ID}`;

function progress(source: AgentSource, text: string): CustomEvent {
  return { type: EventType.CUSTOM, name: 'progress', value: { source, text } };
}

function a2ui(message: { version: 'v0.9'; [key: string]: unknown }): CustomEvent {
  return { type: EventType.CUSTOM, name: 'a2ui', value: message };
}

const decisionViewComponents: A2uiComponentJson[] = [
  {
    id: 'root',
    component: 'DecisionCard',
    status: 'Needs More Evidence',
    disputeType: 'Goods Not Received',
    evidenceReadiness: '2 of 4 required items present',
    recommendedAction: 'Create evidence request task',
    checklistId: 'evidence-checklist',
    actionsId: 'next-actions',
  },
  {
    id: 'evidence-checklist',
    component: 'EvidenceChecklist',
    items: [
      { label: 'Transaction record', present: true },
      { label: 'Merchant response', present: true },
      { label: 'Customer declaration', present: false },
      { label: 'Delivery / non-delivery proof', present: false },
    ],
  },
  {
    id: 'next-actions',
    component: 'NextActions',
    actions: [
      { id: 'create_evidence_request_task', label: 'Create Evidence Request Task' },
      { id: 'escalate_to_reviewer', label: 'Escalate to Reviewer' },
      { id: 'save_case_note', label: 'Save Case Note' },
    ],
  },
];

const approvalPreviewComponents: A2uiComponentJson[] = [
  {
    id: 'root',
    component: 'ApprovalPreview',
    caseId: CASE_ID,
    newCaseStatus: 'Pending Evidence',
    missingItems: ['Missing customer declaration', 'Missing delivery / non-delivery proof'],
    actionAfterApproval: 'Create task in case system and update case status.',
    onApprove: { event: { name: 'approve_task_creation', context: {} } },
    onEdit: { event: { name: 'edit_task_creation', context: {} } },
    onCancel: { event: { name: 'cancel_task_creation', context: {} } },
  },
];

const taskCreatedComponents: A2uiComponentJson[] = [
  {
    id: 'root',
    component: 'TaskCreatedCard',
    taskId: 'EVID-88421',
    caseStatus: 'Pending Evidence',
    auditEntry: 'Created',
    nextOwner: 'Dispute Operations Queue',
  },
];

export const reviewRun: DemoRun = {
  events: [
    {
      delayMs: 0,
      event: { type: EventType.RUN_STARTED, threadId: THREAD_ID, runId: 'run-review' },
    },
    { delayMs: 400, event: progress('orchestrator', 'Understanding dispute...') },
    { delayMs: 400, event: progress('orchestrator', 'Dispute type detected: Goods Not Received') },
    { delayMs: 400, event: progress('orchestrator', 'Preparing specialist review...') },
    { delayMs: 400, event: progress('orchestrator', 'Calling Case Review Agent...') },
    { delayMs: 300, event: progress('orchestrator', 'Calling Policy Agent...') },
    { delayMs: 500, event: progress('case-review', 'Checking transaction status...') },
    { delayMs: 350, event: progress('policy', 'Searching policy document...') },
    { delayMs: 500, event: progress('case-review', 'Transaction found for SGD 250') },
    { delayMs: 400, event: progress('policy', 'Goods Not Received policy section found') },
    { delayMs: 450, event: progress('case-review', 'Merchant response available') },
    { delayMs: 400, event: progress('policy', 'Interpreting policy requirements') },
    { delayMs: 450, event: progress('case-review', 'Case file contains transaction record') },
    { delayMs: 400, event: progress('policy', 'Required evidence list identified') },
    { delayMs: 450, event: progress('case-review', 'Case file contains merchant response') },
    {
      delayMs: 500,
      event: progress('case-review', 'No additional customer documents found in case file'),
    },
    {
      delayMs: 500,
      event: progress('orchestrator', 'Merging case facts with policy requirements...'),
    },
    {
      delayMs: 400,
      event: progress('orchestrator', 'Comparing available documents against required evidence...'),
    },
    { delayMs: 400, event: progress('orchestrator', 'Missing customer declaration') },
    { delayMs: 400, event: progress('orchestrator', 'Missing delivery / non-delivery proof') },
    { delayMs: 400, event: progress('orchestrator', 'Calculating evidence readiness...') },
    {
      delayMs: 0,
      event: { type: EventType.STATE_SNAPSHOT, snapshot: { evidenceReadiness: null } },
    },
    {
      delayMs: 300,
      event: {
        type: EventType.STATE_DELTA,
        delta: [
          { op: 'replace', path: '/evidenceReadiness', value: '2 of 4 required items present' },
        ],
      },
    },
    { delayMs: 400, event: progress('orchestrator', 'Preparing decision view...') },
    {
      delayMs: 400,
      event: a2ui({
        version: 'v0.9',
        createSurface: {
          surfaceId: SURFACE_ID,
          catalogId: DISPUTE_CATALOG_ID,
          sendDataModel: false,
        },
      }),
    },
    {
      delayMs: 300,
      event: a2ui({
        version: 'v0.9',
        updateComponents: { surfaceId: SURFACE_ID, components: decisionViewComponents },
      }),
    },
    {
      delayMs: 0,
      event: { type: EventType.RUN_FINISHED, threadId: THREAD_ID, runId: 'run-review' },
    },
  ],
};

export const previewRun: DemoRun = {
  events: [
    {
      delayMs: 0,
      event: { type: EventType.RUN_STARTED, threadId: THREAD_ID, runId: 'run-preview' },
    },
    {
      delayMs: 400,
      event: a2ui({
        version: 'v0.9',
        updateComponents: { surfaceId: SURFACE_ID, components: approvalPreviewComponents },
      }),
    },
    {
      delayMs: 0,
      event: { type: EventType.RUN_FINISHED, threadId: THREAD_ID, runId: 'run-preview' },
    },
  ],
};

export const approvalRun: DemoRun = {
  events: [
    {
      delayMs: 0,
      event: { type: EventType.RUN_STARTED, threadId: THREAD_ID, runId: 'run-approval' },
    },
    { delayMs: 400, event: progress('orchestrator', 'Creating evidence request task...') },
    {
      delayMs: 400,
      event: progress('orchestrator', 'Updating case status to Pending Evidence...'),
    },
    { delayMs: 400, event: progress('orchestrator', 'Creating audit entry...') },
    { delayMs: 400, event: progress('orchestrator', 'Task created successfully.') },
    {
      delayMs: 300,
      event: a2ui({
        version: 'v0.9',
        updateComponents: { surfaceId: SURFACE_ID, components: taskCreatedComponents },
      }),
    },
    {
      delayMs: 0,
      event: { type: EventType.RUN_FINISHED, threadId: THREAD_ID, runId: 'run-approval' },
    },
  ],
};

export const cancelRun: DemoRun = {
  events: [
    {
      delayMs: 0,
      event: { type: EventType.RUN_STARTED, threadId: THREAD_ID, runId: 'run-cancel' },
    },
    {
      delayMs: 300,
      event: a2ui({
        version: 'v0.9',
        updateComponents: { surfaceId: SURFACE_ID, components: decisionViewComponents },
      }),
    },
    {
      delayMs: 0,
      event: { type: EventType.RUN_FINISHED, threadId: THREAD_ID, runId: 'run-cancel' },
    },
  ],
};
