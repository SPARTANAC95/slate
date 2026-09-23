import { describe, expect, it, vi } from 'vitest';
import { createUpdateController, type UpdateHandle } from './updateController';

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(r => { resolve = r; });
  return { promise, resolve };
};
function setup() {
  const release: UpdateHandle = { version: '0.2.0', body: 'New features', download: vi.fn(async () => {}), install: vi.fn(async () => {}), close: vi.fn(async () => {}) };
  const deps = { currentVersion: '0.1.1', automatic: true, saveAutomatic: vi.fn(), check: vi.fn(async (): Promise<UpdateHandle | null> => release), prepare: vi.fn(async (): Promise<void | (() => void)> => {}), now: () => 1234 };
  return { release, deps, app: createUpdateController(deps) };
}

describe('updates', () => {
  it('announces an update without downloading or installing it', async () => {
    const { app, release } = setup();
    await app.check(false);
    expect(app.getSnapshot()).toMatchObject({ phase: 'available', release: { version: '0.2.0', notes: 'New features' }, checkedAt: 1234 });
    expect(release.download).not.toHaveBeenCalled();
    expect(release.install).not.toHaveBeenCalled();
  });
  it('reports current when no newer release exists', async () => {
    const { app, deps } = setup(); deps.check.mockResolvedValue(null);
    await app.check(); expect(app.getSnapshot().phase).toBe('current');
  });
  it('coalesces simultaneous checks', async () => {
    const { app, deps } = setup();
    await Promise.all([app.check(), app.check(), app.check(false)]);
    expect(deps.check).toHaveBeenCalledTimes(1);
  });
  it('allows retry after offline and synchronous failures', async () => {
    const { app, deps } = setup();
    deps.check.mockImplementationOnce(() => { throw Error('offline'); });
    await app.check(); expect(app.getSnapshot().phase).toBe('error');
    await app.check(); expect(app.getSnapshot().phase).toBe('available');
  });
  it('turns off background checks while preserving manual checks', async () => {
    const { app, deps } = setup(); app.setAutomatic(false);
    await app.check(false); expect(deps.check).not.toHaveBeenCalled();
    await app.check(); expect(deps.check).toHaveBeenCalledTimes(1);
    expect(deps.saveAutomatic).toHaveBeenCalledWith(false);
  });
  it('does not announce an in-flight result after background checks are disabled', async () => {
    const { app, deps, release } = setup(); const gate = deferred();
    deps.check.mockImplementation(async () => { await gate.promise; return release; });
    const check = app.check(false); app.setAutomatic(false); gate.resolve(); await check;
    expect(app.getSnapshot().dismissed).toBe(true);
  });
  it('keeps a dismissed version quiet but announces a later version', async () => {
    const { app, deps, release } = setup(); await app.check(); app.dismiss();
    await app.check(false); expect(app.getSnapshot().dismissed).toBe(true);
    deps.check.mockResolvedValue({ ...release, version: '0.3.0' });
    await app.check(false); expect(app.getSnapshot().dismissed).toBe(false);
  });
  it('closes replaced resources', async () => {
    const { app, release, deps } = setup(); await app.check();
    deps.check.mockResolvedValue(null); await app.check();
    expect(release.close).toHaveBeenCalledTimes(1);
  });
  it('installs once and only after download verification and backup complete', async () => {
    const { app, release, deps } = setup(); const gate = deferred(); const order: string[] = [];
    vi.mocked(release.download).mockImplementation(async () => { order.push('download'); });
    deps.prepare.mockImplementation(async () => { order.push('backup'); await gate.promise; });
    vi.mocked(release.install).mockImplementation(async () => { order.push('install'); });
    await app.check(); const first = app.install(); const duplicate = app.install();
    await vi.waitFor(() => expect(app.getSnapshot().phase).toBe('saving'));
    expect(order).toEqual(['download', 'backup']);
    gate.resolve(); await Promise.all([first, duplicate]);
    expect(order).toEqual(['download', 'backup', 'install']);
    expect(app.getSnapshot().phase).toBe('installing');
  });
  it('blocks installation without a checked release', async () => {
    const { app, release } = setup(); await app.install(); expect(release.download).not.toHaveBeenCalled();
  });
  it('does not replace the update handle during installation', async () => {
    const { app, deps, release } = setup(); const gate = deferred();
    vi.mocked(release.download).mockImplementation(() => gate.promise);
    await app.check(); const job = app.install(); const check = app.check();
    expect(deps.check).toHaveBeenCalledTimes(1); gate.resolve(); await Promise.all([job, check]);
    expect(release.close).not.toHaveBeenCalled();
  });
  it('never backs up or installs a failed or invalid download; retry works', async () => {
    const { app, release, deps } = setup(); vi.mocked(release.download).mockRejectedValueOnce(Error('signature invalid'));
    await app.check(); await app.install();
    expect(app.getSnapshot().error).toContain('verified');
    expect(deps.prepare).not.toHaveBeenCalled(); expect(release.install).not.toHaveBeenCalled();
    await app.install(); expect(release.install).toHaveBeenCalledTimes(1);
  });
  it('stops before install when saving or backing up fails', async () => {
    const { app, release, deps } = setup(); deps.prepare.mockRejectedValue(Error('disk full'));
    await app.check(); await app.install();
    expect(release.install).not.toHaveBeenCalled(); expect(app.getSnapshot().error).toContain('backed up');
  });
  it('resumes normal backups when the installer cannot start', async () => {
    const { app, release, deps } = setup(); const resume = vi.fn(); deps.prepare.mockResolvedValue(resume);
    vi.mocked(release.install).mockRejectedValue(Error('access denied'));
    await app.check(); await app.install();
    expect(resume).toHaveBeenCalledTimes(1); expect(app.getSnapshot().phase).toBe('error');
  });
  it('supports downloads without content-length and ignores invalid progress', async () => {
    const { app, release } = setup();
    vi.mocked(release.download).mockImplementation(async onEvent => {
      onEvent({ event: 'Started', data: {} });
      onEvent({ event: 'Progress', data: { chunkLength: 512 } });
      onEvent({ event: 'Progress', data: { chunkLength: NaN } });
      onEvent({ event: 'Progress', data: { chunkLength: -1 } });
      expect(app.getSnapshot()).toMatchObject({ total: null, downloaded: 512 });
    });
    await app.check(); await app.install();
  });
  it('reports preference storage errors without falsely changing the setting', () => {
    const { app, deps } = setup(); deps.saveAutomatic.mockImplementation(() => { throw Error('denied'); });
    app.setAutomatic(false); expect(app.getSnapshot().automatic).toBe(true); expect(app.getSnapshot().error).toContain('setting');
  });
});
