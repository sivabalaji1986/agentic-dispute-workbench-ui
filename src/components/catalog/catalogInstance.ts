import { Catalog } from '@a2ui/web_core/v0_9';
import type { ReactComponentImplementation } from '@a2ui/react/v0_9';
import type { A2uiComponentJson } from './types';
import { DecisionCard } from './DecisionCard';
import { EvidenceChecklist } from './EvidenceChecklist';
import { NextActions } from './NextActions';
import { ApprovalPreview } from './ApprovalPreview';
import { TaskCreatedCard } from './TaskCreatedCard';
import { UnknownComponentFallback } from './UnknownComponentFallback';

export const DISPUTE_CATALOG_ID = 'https://dispute-workbench.internal/catalogs/v1.json';

export const KNOWN_COMPONENT_TYPES = [
  'DecisionCard',
  'EvidenceChecklist',
  'NextActions',
  'ApprovalPreview',
  'TaskCreatedCard',
] as const;

export const disputeCatalog = new Catalog<ReactComponentImplementation>(DISPUTE_CATALOG_ID, [
  DecisionCard,
  EvidenceChecklist,
  NextActions,
  ApprovalPreview,
  TaskCreatedCard,
  UnknownComponentFallback,
]);

/**
 * Rewrites any component whose type isn't in the closed catalog into the
 * UnknownComponentFallback safety net, so an unrecognized A2UI payload never
 * crashes the renderer. See design doc §4.2.
 */
export function preprocessUnknownComponents(components: A2uiComponentJson[]): A2uiComponentJson[] {
  return components.map((component) => {
    if ((KNOWN_COMPONENT_TYPES as readonly string[]).includes(component.component)) {
      return component;
    }
    return {
      id: component.id,
      component: 'UnknownComponentFallback',
      originalType: component.component,
      raw: JSON.stringify(component),
    };
  });
}
