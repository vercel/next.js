import { nextTestSetup } from 'e2e-utils'
import path from 'path'
import type { NextAdapter } from 'next'

describe('adapter-cache-handlers', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('includes configured cache handler dependencies in Node adapter outputs', async () => {
    const { outputs }: Parameters<NextAdapter['onBuildComplete']>[0] =
      await next.readJSON('build-complete.json')

    const nodeOutputs = [
      ...outputs.pages,
      ...outputs.pagesApi,
      ...outputs.appPages,
      ...outputs.appRoutes,
    ].filter((output) => output.runtime === 'nodejs')

    expect(nodeOutputs.length).toBeGreaterThan(0)

    const expectedAssets = [
      'incremental-cache-handler.js',
      'incremental-cache-helper.js',
      'use-cache-handler.js',
      'use-cache-helper.js',
    ]
    const output = nodeOutputs.find((candidate) =>
      expectedAssets.every((filename) =>
        Object.values(candidate.assets).some(
          (assetPath) => path.basename(assetPath) === filename
        )
      )
    )

    expect(output).toBeDefined()

    for (const filename of expectedAssets) {
      const assetKey = Object.entries(output!.assets).find(
        ([, assetPath]) => path.basename(assetPath) === filename
      )?.[0]

      expect(assetKey).toBeString()

      if (process.env.IS_TURBOPACK_TEST) {
        expect(output!.assetsHashes[assetKey!]).toBeString()
      }
    }
  })
})
