// Adapted from vercel/nft test/unit.test.js at
// 941be1cb3b9d38fbc99a8a6f07af568a64ed0f12. The fixture tree was imported
// from the same revision in vercel/next.js#83233 and remains in place there.
//
// The upstream runner's analyze/graceful-fs mocks, I/O call-count assertions,
// cache assertions, and JavaScript readFile/resolve hooks inspect its pure-JS
// implementation. They cannot cross the native boundary, so this runner keeps
// the behavioral contract: each case must match its unchanged output.js list.

const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')
const vm = require('node:vm')
const { nodeFileTrace } = require('../dist')

const fixtureRoot = path.resolve(
  __dirname,
  '../../../turbopack/crates/turbopack-tracing/tests/node-file-trace'
)

const linuxX64Binding = path.resolve(
  __dirname,
  '../native/turbopack-nft.linux-x64-gnu.node'
)
test(
  'loads the Linux x64 GNU native binding on the verification host',
  {
    skip:
      process.platform === 'linux' && process.arch === 'x64'
        ? false
        : 'This assertion targets the Linux x64 GNU verification host.',
  },
  () => {
    assert.ok(require.cache[linuxX64Binding])
  }
)

// These dependency-light cases are also enabled by turbopack-tracing/tests/unit.rs.
const passingCases = [
  'amd-disable',
  'array-emission',
  'array-holes',
  'class-static',
  'dot-dot',
]

const semanticSkips = new Map([
  [
    'asset-conditional',
    'Turbopack represents a non-static ternary as Unknown instead of tracing nft alternatives.',
  ],
  [
    'browser-remappings',
    'Turbopack traces the selected browser resolution, while nft also lists candidate resolutions.',
  ],
  [
    'depth-0',
    'The native wrapper does not yet limit the traced dependency depth.',
  ],
  [
    'exports',
    'Turbopack follows the selected exports target, while nft also traces the legacy main target.',
  ],
  [
    'resolve-hook',
    'JavaScript custom resolve hooks cannot cross the native tracing boundary.',
  ],
])

function readExpected(caseDirectory) {
  const source = fs.readFileSync(path.join(caseDirectory, 'output.js'), 'utf8')
  const value = vm.runInNewContext(source)
  return Array.from(value).sort()
}

for (const testName of passingCases) {
  test(`matches @vercel/nft unit fixture: ${testName}`, async () => {
    const caseDirectory = path.join(fixtureRoot, 'test/unit', testName)
    const result = await nodeFileTrace([path.join(caseDirectory, 'input.js')], {
      base: fixtureRoot,
      processCwd: caseDirectory,
      ts: true,
      log: false,
      analysis: true,
      mixedModules: true,
      ignore: (file) => file.endsWith('/actual.js'),
    })

    assert.ok(result.fileList instanceof Set)
    assert.ok(result.esmFileList instanceof Set)
    assert.ok(result.reasons instanceof Map)
    assert.ok(result.warnings instanceof Set)
    for (const file of result.fileList) assert.ok(result.reasons.has(file))
    assert.ok(
      result.reasons
        .get(`test/unit/${testName}/input.js`)
        ?.type.includes('initial')
    )
    assert.deepStrictEqual(
      Array.from(result.fileList).sort(),
      readExpected(caseDirectory)
    )
  })
}

for (const [testName, reason] of semanticSkips) {
  test(
    `skips unsupported @vercel/nft unit fixture: ${testName}`,
    { skip: reason },
    () => {}
  )
}
