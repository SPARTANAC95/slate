import { createHash } from 'node:crypto';

export function releaseManifest({ version, signature, notes, publishedAt }) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Use a stable x.y.z release version.');
  if (typeof signature !== 'string' || !signature.trim()) throw new Error('Missing updater signature.');
  if (!Number.isFinite(Date.parse(publishedAt))) throw new Error('Invalid publication date.');
  const name = `Slate_${version}_x64-setup.exe`;
  return {
    version, notes, pub_date: publishedAt,
    platforms: {
      'windows-x86_64': {
        signature: signature.trim(),
        url: `https://github.com/SPARTANAC95/slate/releases/download/v${version}/${name}`,
      },
    },
  };
}

export const sha256 = data => createHash('sha256').update(data).digest('hex');
