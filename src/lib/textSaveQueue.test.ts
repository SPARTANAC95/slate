import { expect, it, vi } from 'vitest';
import { createTextSaveQueue } from './textSaveQueue';

it('waits for queued writes even after their field has unmounted', async () => {
  const queue = createTextSaveQueue(); let finish!: () => void;
  queue.enqueue('day', () => new Promise<void>(resolve => { finish = resolve; }));
  const done = vi.fn(); const waiting = queue.wait().then(done);
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  expect(done).not.toHaveBeenCalled(); finish(); await waiting; expect(done).toHaveBeenCalledOnce();
});
it('serializes saves for the same field so older text cannot finish last', async () => {
  const queue = createTextSaveQueue(); const saved: string[] = []; let finish!: () => void;
  queue.enqueue('day', async () => { await new Promise<void>(r => { finish = r; }); saved.push('old'); });
  queue.enqueue('day', () => { saved.push('new'); });
  await vi.waitFor(() => expect(finish).toBeTypeOf('function')); expect(saved).toEqual([]);
  finish(); await queue.wait(); expect(saved).toEqual(['old', 'new']);
});
it('retains an earlier failure even when a different field saves successfully', async () => {
  const queue = createTextSaveQueue(); queue.enqueue('day-a', async () => { throw Error('disk full'); });
  await expect(queue.wait()).rejects.toThrow('disk full');
  queue.enqueue('day-b', async () => {}); await expect(queue.wait()).rejects.toThrow('disk full');
});
it('allows updating after the failed field has successfully saved again', async () => {
  const queue = createTextSaveQueue(); queue.enqueue('day', () => { throw Error('transient'); });
  await expect(queue.wait()).rejects.toThrow('transient');
  queue.enqueue('day', async () => {}); await expect(queue.wait()).resolves.toBeUndefined();
});
