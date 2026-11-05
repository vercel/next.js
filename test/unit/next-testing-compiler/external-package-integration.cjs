const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

const [group, mode = 'development', repoArgument] = process.argv.slice(2)
const expectedCases = {
  external: 3,
  'external-control': 2,
  'external-actual': 3,
  'external-conditions': 1,
  'external-graph': 1,
  'builtin-control': 2,
  'builtin-actual': 3,
  'builtin-unmock-after': 1,
  'unmock-after': 1,
  'compiled-runtime': 4,
  'compiled-esm-graph': 7,
  'compiled-esm-graph-alias': 1,
  'runtime-cjs': 6,
  'runtime-esm': 6,
  'runtime-builtin': 6,
  'static-runtime-cjs': 1,
  'static-runtime-cjs-unmock-first': 1,
  'static-runtime-cjs-unused': 1,
  'static-runtime-cjs-pending-resolve': 1,
  'static-runtime-cjs-pending-reject': 1,
  'cjs-reset-dependency': 1,
  'cjs-reset-cycle': 1,
  'cjs-reset-actual-dependency': 2,
  'cjs-import-mock-self-default-publication': 2,
  'cjs-import-mock-publication-mutation': 2,
  'compiled-cjs-runtime-leaf-object': 8,
  'compiled-cross-namespace-getter': 1,
  'factory-cause-cjs': 1,
}
assert(Object.hasOwn(expectedCases, group), 'Unknown external fixture')
assert(['development', 'production'].includes(mode))
const repo = path.resolve(repoArgument ?? path.join(__dirname, '../../..'))
const directory = path.join(__dirname, 'external-package', group)
function fixtureFiles(directory, prefix = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const name = prefix + entry.name
    return entry.isDirectory()
      ? fixtureFiles(path.join(directory, entry.name), name + '/')
      : [name]
  })
}
const files = fixtureFiles(directory).map((file) => ({
  target: file
    .replace(/^external-packages\//, 'node_modules/')
    .replace(/\.txt$/, ''),
  bytes: fs.readFileSync(path.join(directory, file)),
}))
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'next-external-case-'))
let passed = false
;(async () => {
  try {
    const { runCompilerCase } = await import(
      '../../lib/next-testing-case-runner.mjs'
    )
    const result = await runCompilerCase({
      repo,
      output,
      mode,
      files,
      expectedCount: expectedCases[group],
      config: {
        maxWorkers: 1,
        projects: [
          {
            name: group,
            environment: 'node',
            ...(mode === 'production' ? { mode } : {}),
            include: ['*.test.mjs'],
          },
        ],
      },
    })
    passed = true
    process.stdout.write(JSON.stringify({ group, ...result }) + '\n')
  } finally {
    if (passed) fs.rmSync(output, { recursive: true, force: true })
    else console.error('External fixture output retained at ' + output)
  }
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
