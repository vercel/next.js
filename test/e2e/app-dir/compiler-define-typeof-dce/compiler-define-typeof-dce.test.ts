import { nextTestSetup } from 'e2e-utils'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { listClientChunks } from 'next-test-utils'

describe('compiler-define-typeof-dce', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })
  if (skipped) return

  it('removes imports behind a false define with a typeof fallback', async () => {
    await next.build()

    const chunksDir = join(next.testDir, '.next')
    const chunks = await Promise.all(
      (await listClientChunks(chunksDir)).map((filename) =>
        readFile(join(chunksDir, filename), 'utf8')
      )
    )

    expect(chunks.join('\n')).not.toContain('TYPEOF_DEFINE_DEAD_IMPORT_MARKER')
  })
})
