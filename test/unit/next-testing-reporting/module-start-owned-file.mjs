import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const require = createRequire(import.meta.url)
require('next/dist/server/node-environment-baseline')
const { initializeTestFile } = require('next/dist/experimental/testing/runner')
const [mode, output] = process.argv.slice(2),
  root = mkdtempSync(join(tmpdir(), 'next-module-start-file-')),
  filePath = join(root, 'case.mjs')
writeFileSync(filePath, '// private actual File component\n')
let file,
  actualFile,
  preparedResult,
  calls = 0,
  bodies = 0
try {
  file = initializeTestFile({
    fileId: 'owned-module-start-file',
    filePath,
    publicTaskSelection: true,
    snapshotUpdateMode: 'none',
    ...(mode === 'absent'
      ? {}
      : { preparePublicSnapshots: mode === 'truthy' ? 'true' : true }),
  })
  await file.collect(async () => {
    file.api.test('actual body', () => {
      bodies++
    })
  })
  const result = await file.run({
    runId: 'owned-file-run',
    signal: new AbortController().signal,
    captureModuleStart: true,
    onCollected(current) {
      actualFile = current
    },
    onFilePrepared(current) {
      calls++
      assert.equal(current, actualFile)
      assert.equal(current.file, current)
      assert.equal(current.result.state, 'run')
      preparedResult = current.result
    },
  })
  assert.equal(calls, mode === 'owned' ? 1 : 0)
  assert.equal(bodies, 1)
  assert.deepEqual(result.errors, [])
  if (mode === 'owned') assert.equal(actualFile.result, preparedResult)
  await file.dispose()
  file = undefined
  writeFileSync(
    output,
    JSON.stringify(
      {
        mode,
        calls,
        bodies,
        actualOwnedResultIdentity: true,
        absentRoleSemanticsHeld: true,
        allFileScopesJoined: true,
        execPath: process.execPath,
        versions: process.versions,
      },
      null,
      2
    ) + '\n'
  )
} finally {
  await file?.dispose()
  rmSync(root, { recursive: true, force: true })
}
