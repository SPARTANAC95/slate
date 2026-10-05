import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'));
const docs = fs.readdirSync(path.join(root,'docs')).filter(name => /\.(md|html)$/.test(name)).map(name => 'docs/'+name);
const files = ['README.md','CHANGELOG.md','CONTRIBUTING.md', ...docs];
let links = 0;
for (const file of files) {
  const text = fs.readFileSync(path.join(root,file),'utf8');
  const refs = [...text.matchAll(/(?:href|src)="([^"]+)"/g), ...text.matchAll(/\]\(([^)]+)\)/g)].map(m => m[1]);
  for (const ref of refs) {
    if (/^[a-z]+:|^\/\//i.test(ref)) continue;
    const [target,fragment] = ref.split('#');
    const resolved = target ? path.resolve(root,path.dirname(file),decodeURIComponent(target)) : path.join(root,file);
    assert(resolved.startsWith(root+path.sep), 'Link escapes repository: '+file+' → '+ref);
    assert(fs.existsSync(resolved),'Missing local link: '+file+' → '+ref);
    if (fragment && /\.html$/.test(resolved)) {
      const html=fs.readFileSync(resolved,'utf8');
      assert(html.includes('id="'+decodeURIComponent(fragment)+'"'),'Missing HTML anchor: '+file+' → '+ref);
    }
    links++;
  }
}
const capture=JSON.parse(fs.readFileSync(path.join(root,'docs/assets/capture.json'),'utf8'));
assert.equal(capture.version,JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version);
assert.equal(capture.screenshots.length,6);
for(const name of capture.screenshots){
  const image=fs.readFileSync(path.join(root,'docs/assets',name));
  assert.equal(image.subarray(0,8).toString('hex'),'89504e470d0a1a0a',name+' is not PNG');
  assert(image.readUInt32BE(16)>400 && image.readUInt32BE(20)>300,name+' is unexpectedly small');
}
const site=fs.readFileSync(path.join(root,'docs/site.js'),'utf8');
for(const match of site.matchAll(/src:'([^']+)'/g)) assert(fs.existsSync(path.join(root,'docs',match[1])),'Missing switcher image '+match[1]);
console.log(`PASS ${links} local documentation/asset links, six native PNGs, capture version and website switcher assets`);
