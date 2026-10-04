const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
test('All 32 shipped characters are distinct existing online assets with matching provenance', () => {
  const root = path.resolve(__dirname, '..'), assets = path.join(root, 'dist', 'assets');
  const list = JSON.parse(fs.readFileSync(path.join(assets, 'characters.json')));
  const provenance = JSON.parse(fs.readFileSync(path.join(root, 'asset-provenance.json')));
  assert.equal(list.length, 32); const hashes = new Set();
  for (const item of list) { assert.match(item.name, /^奶[龙蛙]·/); assert.equal(new URL(item.source).protocol, 'https:'); assert.equal(provenance.selection.find(x => x.file === item.file).source, item.source); const bytes = fs.readFileSync(path.join(assets, item.file)); hashes.add(crypto.createHash('sha256').update(bytes).digest('hex')); const signature = bytes.subarray(0, 8).toString('hex'); if (item.file.endsWith('.png')) assert.equal(signature, '89504e470d0a1a0a'); if (item.file.endsWith('.jpg')) assert.ok(signature.startsWith('ffd8ff')); if (item.file.endsWith('.gif')) assert.ok(bytes.subarray(0, 6).toString().startsWith('GIF8')); }
  assert.equal(hashes.size, 32);
});
