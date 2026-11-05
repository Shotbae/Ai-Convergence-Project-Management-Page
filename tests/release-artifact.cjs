const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

module.exports = function ({context, test, assert}) {
  test('Delivered versioned whole-code file matches its manifest, current source and runtime checks', () => {
    const root = path.resolve(__dirname, '..');
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'releases', context.SETC_BUILD_ID_ + '.json'), 'utf8'));
    const release = fs.readFileSync(path.join(root, 'releases', manifest.file));
    assert.equal(release.length, manifest.bytes);
    assert.equal(crypto.createHash('sha256').update(release).digest('hex'), manifest.sha256);
    assert.ok(release.equals(fs.readFileSync(path.join(root, 'aiconvpromanage.gs'))));
    const delivered = vm.createContext({});
    vm.runInContext(release.toString('utf8'), delivered);
    assert.equal(delivered.SETC_BUILD_ID_, manifest.version);
    assert.equal(delivered.checkSetcRuntime_().ok, true);
    for (const name of ['ensureCompletionFilter_', 'normalizeSetcSpaces_', 'getAttendanceDayCount_']) {
      assert.equal(typeof delivered[name], 'function');
    }
  });
};
