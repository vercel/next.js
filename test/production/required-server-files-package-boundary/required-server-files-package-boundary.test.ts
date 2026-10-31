import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'

describe('distDir package.json commonjs boundary', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    // Use "type": "module" in the project package.json so the boundary file
    // is what determines whether `.next/server/**/*.js` is loaded as CJS.
    packageJson: {
      type: 'module',
    },
  })

  it('writes the distDir package.json with the commonjs boundary', async () => {
    const distPackageJson = JSON.parse(
      await next.readFile('.next/package.json')
    )
    expect(distPackageJson).toEqual({ type: 'commonjs' })
  })

  it('lists the distDir package.json in required-server-files.json', async () => {
    const manifest = JSON.parse(
      await next.readFile('.next/required-server-files.json')
    )
    // Adapters consume `requiredServerFiles.files` to seed the per-page
    // shared assets. The boundary marker must be in this list because
    // per-page nft traces do not include it.
    expect(manifest.files).toContain(join('.next', 'package.json'))
  })

  it('includes the distDir package.json in every adapter page output assets', async () => {
    // The adapter writes per-page asset keys to `.next/adapter-page-assets.json`
    // during onBuildComplete. The fix in `build/index.ts` ensures the boundary
    // is in `requiredServerFiles.files`, which `handleBuildComplete` then
    // merges into every page output's `assets` map.
    const pageAssets = JSON.parse(
      await next.readFile('.next/adapter-page-assets.json')
    )

    const pageIds = Object.keys(pageAssets)
    expect(pageIds.length).toBeGreaterThan(0)

    const boundaryPath = join('.next', 'package.json')
    for (const pageId of pageIds) {
      expect(pageAssets[pageId]).toContain(boundaryPath)
    }
  })
})
