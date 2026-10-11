import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { commitSnapshotUpdates } from 'next/dist/experimental/testing/assertions/snapshots'

it('commits in a parent with an existing assertion host without loading another matcher registry', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'next-snapshot-parent-'))
  const testPath = join(directory, 'parent.test.ts')
  const path = join(directory, '__snapshots__', 'parent.test.ts.snap')
  await mkdir(join(directory, '__snapshots__'))
  await writeFile(path, 'original')
  try {
    await commitSnapshotUpdates(testPath, [
      { path, content: 'updated', previousContent: 'original' },
    ])
    expect(await readFile(path, 'utf8')).toBe('updated')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
