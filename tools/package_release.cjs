const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'aiconvpromanage.gs'));
const context = vm.createContext({});
vm.runInContext(source.toString('utf8'), context);
if (typeof context.checkSetcRuntime_ !== 'function' || !context.checkSetcRuntime_().ok) {
  throw new Error('Runtime punctuation checks failed; release was not created.');
}
for (const name of ['ensureCompletionFilter_', 'normalizeSetcSpaces_', 'getAttendanceDayCount_']) {
  if (typeof context[name] !== 'function') throw new Error('Missing feature: ' + name);
}
const version = context.SETC_BUILD_ID_;
const file = 'AI융합_전체코드_' + version + '.txt';
const directory = path.join(root, 'releases');
const target = path.join(directory, file);
fs.mkdirSync(directory, {recursive: true});
if (fs.existsSync(target) && !fs.readFileSync(target).equals(source)) {
  throw new Error('This version already has different contents. Use a new build version.');
}
fs.writeFileSync(target, source);
const manifest = {version, file, bytes: source.length,
  sha256: crypto.createHash('sha256').update(source).digest('hex')};
fs.writeFileSync(path.join(directory, version + '.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('Verified release:', file, manifest.sha256);
