import { test as it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  SnapshotClient,
  NodeSnapshotEnvironment,
} from 'next/dist/compiled/next-test-primitives'

it('restores original snapshots and removes failed-attempt additions when retry has no snapshots', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'next-snapshot-rollback-'))
  const file = join(directory, 'case.test.ts')
  const snapshot = join(directory, '__snapshots__', 'case.test.ts.snap')
  await mkdir(join(directory, '__snapshots__'))
  try {
    await writeFile(
      snapshot,
      '// Snapshot v1\n\nexports[`case 1`] = `"original"`;\n'
    )
    const client = new SnapshotClient()
    await client.setup(file, {
      updateSnapshot: 'all',
      snapshotEnvironment: new NodeSnapshotEnvironment(),
    })
    client.match({
      received: 'failed replacement',
      filepath: file,
      name: 'case',
      testId: 'case',
    })
    client.match({
      received: 'failed addition',
      filepath: file,
      name: 'case',
      testId: 'case',
      message: 'new',
    })
    client.clearTest(file, 'case')
    await client.finish(file)
    const content = await readFile(snapshot, 'utf8')
    assert.match(content, /"original"/)
    assert.doesNotMatch(content, /failed replacement/)
    assert.doesNotMatch(content, /failed addition/)
    assert.doesNotMatch(content, /case > new/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
