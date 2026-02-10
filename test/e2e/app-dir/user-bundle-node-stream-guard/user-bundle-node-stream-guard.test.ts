import path from 'path'

import { nextTestSetup } from 'e2e-utils'

describe('user bundle - node stream guard', () => {
  const { next, isNextDev, isTurbopack, skipped } = nextTestSetup({
    // Reuse this fixture because it exercises app-page resume/render bundling.
    files: path.join(__dirname, '../ppr-partial-hydration'),
    skipDeployment: true,
    skipStart: true,
  })

  if (isNextDev || skipped || isTurbopack) {
    it.skip('only testable in webpack production (non-deployment)', () => {})
    return
  }

  it('should keep node-stream-only helpers out of default server chunks', async () => {
    const { exitCode } = await next.build()
    expect(exitCode).toBe(0)

    const pageTrace = JSON.parse(
      await next.readFile(
        '.next/server/app/with-shell/without-metadata/page.js.nft.json'
      )
    ) as { files: string[] }
    const tracedFiles = pageTrace.files.join('\n')

    expect(tracedFiles).not.toContain(
      'next/dist/server/stream-utils/node-stream-helpers.js'
    )

    const tracedChunkFiles = pageTrace.files.filter(
      (file) => file.startsWith('../../../chunks/') && file.endsWith('.js')
    )
    const chunkSources = (
      await Promise.all(
        tracedChunkFiles.map((file) =>
          next.readFile(
            path.join('.next/server/app/with-shell/without-metadata', file)
          )
        )
      )
    ).join('\n')

    expect(chunkSources).not.toContain('stream-utils/node-stream-helpers')
    expect(chunkSources).not.toContain('node:stream/promises')
  })
})
