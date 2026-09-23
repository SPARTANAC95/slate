import { describe, expect, it } from 'vitest';
import { releaseManifest, sha256 } from './release-manifest.mjs';
const input = { version: '0.1.1', signature: 'signed-value\n', notes: 'Release notes', publishedAt: '2026-09-23T01:00:00Z' };
describe('release manifest', () => {
  it('links the signature to the exact versioned installer', () => {
    const manifest = releaseManifest(input);
    expect(manifest.platforms['windows-x86_64']).toEqual({ signature: 'signed-value', url: 'https://github.com/SPARTANAC95/slate/releases/download/v0.1.1/Slate_0.1.1_x64-setup.exe' });
    expect(manifest.version).toBe('0.1.1');
  });
  it.each(['../wrong', 'v0.1.1', '0.1.2-beta.1', ''])('rejects invalid or prerelease version %s', version => {
    expect(() => releaseManifest({ ...input, version })).toThrow();
  });
  it('rejects missing signatures and invalid dates', () => {
    expect(() => releaseManifest({ ...input, signature: '  ' })).toThrow();
    expect(() => releaseManifest({ ...input, publishedAt: 'unknown' })).toThrow();
  });
  it('detects altered artifact bytes', () => {
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256('abcd')).not.toBe(sha256('abc'));
  });
});
