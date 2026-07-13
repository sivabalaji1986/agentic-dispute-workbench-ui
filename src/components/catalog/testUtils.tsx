import { render } from '@testing-library/react';
import { Catalog, MessageProcessor, type ActionListener } from '@a2ui/web_core/v0_9';
import type { A2uiMessage } from '@a2ui/web_core/v0_9';
import { A2uiSurface, type ReactComponentImplementation } from '@a2ui/react/v0_9';
import type { A2uiComponentJson } from './types';

let surfaceCounter = 0;

/**
 * Renders a component tree through the real A2UI pipeline. `components[0].id`
 * must be `'root'` — `A2uiSurface` always renders from the id `'root'`.
 */
export function renderA2uiComponents(
  catalogComponents: ReactComponentImplementation[],
  components: A2uiComponentJson[],
  options: { dataModel?: Record<string, unknown>; onAction?: ActionListener } = {},
) {
  const surfaceId = `test-surface-${++surfaceCounter}`;
  const catalog = new Catalog<ReactComponentImplementation>(
    'https://dispute-workbench.internal/catalogs/test.json',
    catalogComponents,
  );
  const processor = new MessageProcessor<ReactComponentImplementation>([catalog], options.onAction);

  const messages: A2uiMessage[] = [
    { version: 'v0.9', createSurface: { surfaceId, catalogId: catalog.id } },
    {
      version: 'v0.9',
      updateComponents: { surfaceId, components },
    } as A2uiMessage,
  ];
  if (options.dataModel) {
    messages.push({
      version: 'v0.9',
      updateDataModel: { surfaceId, value: options.dataModel },
    } as A2uiMessage);
  }

  processor.processMessages(messages);
  const surface = processor.model.getSurface(surfaceId);
  if (!surface) {
    throw new Error('Surface was not created');
  }

  return render(<A2uiSurface surface={surface} />);
}
