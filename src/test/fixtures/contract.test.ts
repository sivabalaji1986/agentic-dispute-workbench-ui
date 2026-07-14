import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { MessageProcessor } from '@a2ui/web_core/v0_9';
import type { ReactComponentImplementation } from '@a2ui/react/v0_9';
import { createWorkbenchAgentSubscriber } from '../../agui/bridge';
import { useWorkbenchStore } from '../../state/workbenchStore';
import { disputeCatalog } from '../../components/catalog/catalogInstance';
import { replayFixture } from './replayFixture';

function fixturePath(name: string): string {
  return fileURLToPath(new URL(name, import.meta.url));
}

// Same accessor bridge.ts's own onRunFinishedEvent (Task 7) uses to read a
// surface's current root component type — reused here rather than inventing
// a second way to read the same thing.
function rootComponentType(
  processor: MessageProcessor<ReactComponentImplementation>,
): string | undefined {
  const surface = processor.model.surfacesMap.values().next().value;
  return surface?.componentsModel.get('root')?.type;
}

describe('captured-stream contract fixtures', () => {
  it('review-success.ndjson ends with the three-entry decision view and no error', () => {
    const processor = new MessageProcessor([disputeCatalog]);
    useWorkbenchStore.setState({ progressLines: [], transportError: null, protocolError: null });
    const subscriber = createWorkbenchAgentSubscriber(processor);
    replayFixture(fixturePath('review-success.ndjson'), subscriber);
    const surface = processor.model.surfacesMap.values().next().value;
    expect(surface).toBeDefined();
    expect(rootComponentType(processor)).toBe('DecisionCard');
    expect(useWorkbenchStore.getState().transportError).toBeNull();
    expect(useWorkbenchStore.getState().protocolError).toBeNull();
    expect(useWorkbenchStore.getState().progressLines.length).toBeGreaterThan(0);
  });

  it('preview-success.ndjson swaps the surface to ApprovalPreview', () => {
    const processor = new MessageProcessor([disputeCatalog]);
    useWorkbenchStore.setState({ transportError: null, protocolError: null });
    const subscriber = createWorkbenchAgentSubscriber(processor);
    // preview-success.ndjson only updates an existing surface — createSurface
    // must have already happened, same as a real session (§3.3/§3.5).
    replayFixture(fixturePath('review-success.ndjson'), subscriber);
    replayFixture(fixturePath('preview-success.ndjson'), subscriber);
    expect(rootComponentType(processor)).toBe('ApprovalPreview');
    expect(useWorkbenchStore.getState().transportError).toBeNull();
    expect(useWorkbenchStore.getState().protocolError).toBeNull();
  });

  it('approval-success.ndjson ends with TaskCreatedCard', () => {
    const processor = new MessageProcessor([disputeCatalog]);
    useWorkbenchStore.setState({ transportError: null, protocolError: null });
    const subscriber = createWorkbenchAgentSubscriber(processor);
    // same layered-replay pattern: review-success then approval-success
    replayFixture(fixturePath('review-success.ndjson'), subscriber);
    replayFixture(fixturePath('approval-success.ndjson'), subscriber);
    expect(rootComponentType(processor)).toBe('TaskCreatedCard');
    expect(useWorkbenchStore.getState().transportError).toBeNull();
    expect(useWorkbenchStore.getState().protocolError).toBeNull();
  });

  it('cancel-success.ndjson reverts to the decision view', () => {
    const processor = new MessageProcessor([disputeCatalog]);
    useWorkbenchStore.setState({ transportError: null, protocolError: null });
    const subscriber = createWorkbenchAgentSubscriber(processor);
    // same layered-replay pattern: review-success then cancel-success
    replayFixture(fixturePath('review-success.ndjson'), subscriber);
    replayFixture(fixturePath('preview-success.ndjson'), subscriber);
    replayFixture(fixturePath('cancel-success.ndjson'), subscriber);
    expect(rootComponentType(processor)).toBe('DecisionCard');
    expect(useWorkbenchStore.getState().transportError).toBeNull();
    expect(useWorkbenchStore.getState().protocolError).toBeNull();
  });

  it('invalid-a2ui-payload.ndjson surfaces a protocol error and creates no surface', () => {
    const processor = new MessageProcessor([disputeCatalog]);
    useWorkbenchStore.setState({ transportError: null, protocolError: null });
    const subscriber = createWorkbenchAgentSubscriber(processor);
    replayFixture(fixturePath('invalid-a2ui-payload.ndjson'), subscriber);
    expect(processor.model.surfacesMap.size).toBe(0);
    expect(useWorkbenchStore.getState().protocolError).not.toBeNull();
    expect(useWorkbenchStore.getState().protocolError?.retryable).toBe(false);
  });

  it('disconnected-midrun.ndjson surfaces a retryable transport error', () => {
    const processor = new MessageProcessor([disputeCatalog]);
    useWorkbenchStore.setState({
      transportError: null,
      protocolError: null,
      connectionStatus: 'idle',
    });
    const subscriber = createWorkbenchAgentSubscriber(processor);
    replayFixture(fixturePath('disconnected-midrun.ndjson'), subscriber);
    expect(useWorkbenchStore.getState().connectionStatus).toBe('failed');
    expect(useWorkbenchStore.getState().transportError?.retryable).toBe(true);
  });
});
