import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { releaseManifest, sha256 } from './release-manifest.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
const readJson = name => JSON.parse(fs.readFileSync(name, 'utf8'));
const { version } = readJson('package.json');
const tag = `v${version}`;
const installerName = `Slate_${version}_x64-setup.exe`;
const folder = path.join(root, 'output', 'release', tag);
const notes = fs.readFileSync(`releases/${tag}.md`, 'utf8');
const git = args => {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args[0]} failed: ${result.stderr}`);
  return result.stdout.trim();
};
function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { stdio: 'inherit', env });
  if (result.status !== 0) throw new Error(`${command} failed (${result.status})`);
}
function validateVersion() {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Only stable releases are supported.');
  const cargo = fs.readFileSync('src-tauri/Cargo.toml', 'utf8').match(/^version = "([^"]+)"/m)?.[1];
  if (cargo !== version || readJson('src-tauri/tauri.conf.json').version !== version || readJson('package-lock.json').version !== version) {
    throw new Error('Version mismatch: update package.json, package-lock.json, Cargo.toml and tauri.conf.json.');
  }
}

function signingEnvironment() {
  const env = { ...process.env, CARGO_BUILD_JOBS: process.env.CARGO_BUILD_JOBS || '2' };
  const cargoBin = path.join(os.homedir(), '.cargo', 'bin');
  const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path') || 'PATH';
  env[pathKey] = `${cargoBin}${path.delimiter}${env[pathKey] || ''}`;
  if (!env.TAURI_SIGNING_PRIVATE_KEY) {
    const keyPath = path.join(os.homedir(), '.tauri', 'slate-updater.key');
    env.TAURI_SIGNING_PRIVATE_KEY = fs.readFileSync(keyPath, 'utf8').trim();
    const passwordEnv = { ...process.env, SLATE_PASSWORD_FILE: `${keyPath}.password.dpapi` };
    // PowerShell 7 module paths can break Windows PowerShell's security module.
    for (const key of Object.keys(passwordEnv)) if (key.toLowerCase() === 'psmodulepath') delete passwordEnv[key];
    const password = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      '$s = (Get-Content -Raw -LiteralPath $env:SLATE_PASSWORD_FILE).Trim() | ConvertTo-SecureString; $p = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($s); try { [Console]::Write([System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($p)) } finally { [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p) }'],
    { encoding: 'utf8', env: passwordEnv });
    if (password.status !== 0 || !password.stdout) throw new Error('Cannot unlock local signing key. Supply TAURI_SIGNING_PRIVATE_KEY and TAURI_SIGNING_PRIVATE_KEY_PASSWORD.');
    env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD = password.stdout;
  }
  return env;
}

async function build() {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Build on Windows x64.');
  validateVersion();
  const env = signingEnvironment();
  run(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--maxWorkers=2'], env);
  run(path.join(os.homedir(), '.cargo', 'bin', 'cargo.exe'), ['test', '--locked', '--lib', '--manifest-path', 'src-tauri/Cargo.toml'], env);
  run(process.execPath, ['node_modules/@tauri-apps/cli/tauri.js', 'build', '--bundles', 'nsis'], env);
  const installer = path.join('src-tauri', 'target', 'release', 'bundle', 'nsis', installerName);
  const signature = fs.readFileSync(`${installer}.sig`, 'utf8').trim();
  const manifest = releaseManifest({ version, signature, notes, publishedAt: new Date().toISOString() });
  fs.mkdirSync(folder, { recursive: true });
  fs.copyFileSync(installer, path.join(folder, installerName));
  fs.copyFileSync(`${installer}.sig`, path.join(folder, `${installerName}.sig`));
  fs.writeFileSync(path.join(folder, 'latest.json'), JSON.stringify(manifest, null, 2) + '\n');
  const files = [installerName, `${installerName}.sig`, 'latest.json'];
  const hashes = Object.fromEntries(files.map(name => [name, sha256(fs.readFileSync(path.join(folder, name)))]));
  fs.writeFileSync(path.join(folder, 'SHA256SUMS.txt'), files.map(name => `${hashes[name]}  ${name}\n`).join(''));
  fs.writeFileSync(path.join(folder, 'build.json'), JSON.stringify({ version, commit: git(['rev-parse', 'HEAD']), clean: !git(['status', '--porcelain']), hashes }, null, 2));
  console.log(`Signed release files ready: ${folder}`);
}

function token() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  const result = spawnSync('git', ['credential', 'fill'], {
    input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
  });
  const secret = result.status === 0 && result.stdout.split(/\r?\n/).find(line => line.startsWith('password='))?.slice(9);
  if (!secret) throw new Error('Sign into GitHub with Git Credential Manager, or set GITHUB_TOKEN.');
  return secret;
}

async function publish() {
  validateVersion();
  const buildInfo = readJson(path.join(folder, 'build.json'));
  const head = git(['rev-parse', 'HEAD']);
  if (git(['status', '--porcelain']) || !buildInfo.clean || buildInfo.commit !== head || buildInfo.version !== version) {
    throw new Error('Commit your changes, then run release:build from that clean commit before publishing.');
  }
  if (git(['rev-parse', `${tag}^{commit}`]) !== head) throw new Error('The release tag must point to the built commit.');
  const remoteTags = git(['ls-remote', 'origin', `refs/tags/${tag}`, `refs/tags/${tag}^{}`]);
  if (!remoteTags.split('\n').some(line => line.startsWith(`${head}\t`))) throw new Error('Push the release tag before publishing.');
  for (const [name, hash] of Object.entries(buildInfo.hashes)) {
    if (sha256(fs.readFileSync(path.join(folder, name))) !== hash) throw new Error(`Release file changed after build: ${name}`);
  }
  const expectedSums = Object.entries(buildInfo.hashes).map(([name, hash]) => `${hash}  ${name}\n`).join('');
  if (fs.readFileSync(path.join(folder, 'SHA256SUMS.txt'), 'utf8') !== expectedSums) throw new Error('Checksum list does not match the build.');
  const credential = token();
  const api = async (route, method = 'GET', body, binary = false) => {
    const url = new URL(route.startsWith('/') ? `https://api.github.com${route}` : route);
    if (!['api.github.com', 'uploads.github.com'].includes(url.hostname)) throw new Error('Unexpected GitHub host.');
    const response = await fetch(url, { method, headers: {
      Authorization: `Bearer ${credential}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Slate-release',
      'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': binary ? 'application/octet-stream' : 'application/json',
    }, body: body === undefined ? undefined : binary ? body : JSON.stringify(body) });
    if (!response.ok) throw new Error(`GitHub ${method} ${url.pathname}: ${response.status}`);
    return response.status === 204 ? null : response.json();
  };
  const base = '/repos/SPARTANAC95/slate/releases';
  const releases = await api(`${base}?per_page=100`);
  let release = releases.find(item => item.tag_name === tag);
  if (release && !release.draft) throw new Error('This release is already published; use a new version.');
  if (!release) release = await api(base, 'POST', { tag_name: tag, target_commitish: head, name: `Slate ${version}`, body: notes, draft: true, prerelease: false });
  else await api(`${base}/${release.id}`, 'PATCH', { name: `Slate ${version}`, body: notes });
  for (const name of [installerName, `${installerName}.sig`, 'latest.json', 'SHA256SUMS.txt']) {
    const existing = release.assets.find(asset => asset.name === name);
    if (existing) await api(`${base}/assets/${existing.id}`, 'DELETE');
    const upload = release.upload_url.split('{')[0] + `?name=${encodeURIComponent(name)}`;
    await api(upload, 'POST', fs.readFileSync(path.join(folder, name)), true);
  }
  const published = await api(`${base}/${release.id}`, 'PATCH', { draft: false, make_latest: 'true' });
  console.log(`Published ${published.html_url}`);
}

try {
  if (process.argv[2] === 'build') await build();
  else if (process.argv[2] === 'publish') await publish();
  else throw new Error('Usage: node tools/release.mjs build|publish');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
