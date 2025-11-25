import glob from 'glob'
import path from 'path'
import fs from 'fs/promises'
import { nextTestSetup } from 'e2e-utils'

describe('externals-transitive', () => {
  const { next, isTurbopack, isNextDeploy, isNextStart } = nextTestSetup({
    files: __dirname,
    dependencies: require('./package.json').dependencies,
  })

  it('uses the right version of transitive externals', async () => {
    const $ = await next.render$('/')
    const body = $('body > p').text().trim()
    expect(body).toEqual(`depA: 3.10.1, depB: 4.17.21, 4.17.21`)

    if (!isNextDeploy) {
      const files = glob.sync('**/*.js', {
        cwd: path.join(next.testDir, next.distDir, 'server'),
      })
      let isLodashBundled = false
      for (const file of files) {
        const content = await next.readFile(
          path.join(next.distDir, 'server', file)
        )
        isLodashBundled =
          isLodashBundled ||
          // Code
          content.includes('__lodash_hash_undefined__') ||
          // Package.json
          content.includes('Lodash modular utilities.')
      }

      if (isTurbopack) {
        // Assert that lodash wasn't bundled. Turbopack creates symlinks to be able to access
        // transitive dependencies at runtime.
        expect(isLodashBundled).toBe(false)

        let symlinks = (
          await fs.readdir(
            path.join(next.testDir, next.distDir, 'node_modules')
          )
        ).filter((file) => file.startsWith('lodash-'))

        expect(symlinks.length).toBeGreaterThanOrEqual(2)

        if (isNextStart) {
          // Lists the two symlinks in the NFT
          const trace = (await next.readJSON(
            '.next/server/app/page.js.nft.json'
          )) as { files: string[] }

          for (let symlink of symlinks) {
            expect(trace.files).toContain(`../../node_modules/${symlink}`)
          }
        }
      } else {
        // Webpack ends up bundling lodash in dep-a
        expect(isLodashBundled).toBe(true)
      }
    }
  })
})
