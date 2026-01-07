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
    expect(body).toEqual(`depA: 3.10.1, depB: 4.17.21, 4.17.21, 5.0.0`)

    if (!isNextDeploy) {
      const files = glob.sync('**/*.js', {
        cwd: path.join(next.testDir, next.distDir, 'server'),
      })
      let isLodashBundled = false
      let isStorybookGlobalBundled = false
      for (const file of files) {
        const content = await next.readFile(
          path.join(next.distDir, 'server', file)
        )
        isLodashBundled =
          isLodashBundled ||
          // Code
          content.includes('__lodash_hash_undefined__') ||
          // package.json
          content.includes('Lodash modular utilities.')

        isStorybookGlobalBundled =
          isStorybookGlobalBundled ||
          // package.json
          content.includes('Require global variables')
      }

      if (isTurbopack) {
        // Assert that the libraries weren't bundled. Turbopack creates symlinks to be able to
        // access transitive dependencies at runtime.
        expect(isLodashBundled).toBe(false)
        expect(isStorybookGlobalBundled).toBe(false)

        let lodashSymlinks = (
          await fs.readdir(
            path.join(next.testDir, next.distDir, 'node_modules')
          )
        ).filter((file) => file.startsWith('lodash-'))
        // There are two symlinks created, one for each lodash version
        expect(lodashSymlinks.length).toBe(2)

        let storybookGlobalSymlinks = (
          await fs.readdir(
            path.join(next.testDir, next.distDir, 'node_modules', '@storybook')
          )
        ).filter((file) => file.startsWith('global-'))
        expect(storybookGlobalSymlinks.length).toBe(1)

        if (isNextStart) {
          // Lists the two symlinks in the NFT
          const trace = (await next.readJSON(
            '.next/server/app/page.js.nft.json'
          )) as { files: string[] }

          for (let symlink of lodashSymlinks) {
            expect(trace.files).toContain(`../../node_modules/${symlink}`)
          }
          for (let symlink of storybookGlobalSymlinks) {
            expect(trace.files).toContain(
              `../../node_modules/@storybook/${symlink}`
            )
          }
        }
      } else {
        // Webpack ends up bundling lodash in dep-a
        expect(isLodashBundled).toBe(true)
      }
    }
  })
})
