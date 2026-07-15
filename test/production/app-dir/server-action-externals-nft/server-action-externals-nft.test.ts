import fs from 'fs/promises'
import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('server-action-externals-nft', () => {
  const { next, isTurbopack, isNextDeploy } = nextTestSetup({
    files: __dirname,
    dependencies: require('./package.json').dependencies,
  })

  async function getTracedExternals(nftPath: string) {
    const trace = (await next.readJSON(nftPath)) as { files: string[] }
    const nftDir = path.join(next.testDir, path.dirname(nftPath))
    const realNftDir = await fs.realpath(nftDir)
    const aliasDir = path.join(next.testDir, '.next', 'node_modules')

    const result: Record<
      string,
      { alias: string | undefined; aliasTraced: boolean; targetFiles: string[] }
    > = {}
    for (const pkg of ['lodash', 'yocto-queue']) {
      const alias = (await fs.readdir(aliasDir)).find((file) =>
        file.startsWith(`${pkg}-`)
      )
      let aliasTraced = false
      let targetFiles: string[] = []
      if (alias) {
        aliasTraced = trace.files.includes(
          path.relative(nftDir, path.join(aliasDir, alias))
        )
        // The alias is a symlink into the package store (e.g.
        // node_modules/.pnpm/...). The real package files must be part of the
        // trace as well, otherwise the alias dangles when the output is
        // assembled strictly from the trace (e.g. when deploying).
        const target = await fs.realpath(path.join(aliasDir, alias))
        const targetPrefix = path.relative(realNftDir, target)
        targetFiles = trace.files.filter((file) =>
          file.startsWith(`${targetPrefix}/`)
        )
      }
      result[pkg] = { alias, aliasTraced, targetFiles }
    }
    return result
  }

  it('should invoke the server action that uses external packages', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('button').click()
    await retry(async () => {
      expect(await browser.elementByCss('#result').text()).toBe('helloWorld')
    })
  })

  if (isTurbopack && !isNextDeploy) {
    it('should trace externals used directly by a page', async () => {
      const externals = await getTracedExternals(
        '.next/server/app/direct/page.js.nft.json'
      )
      for (const pkg of ['lodash', 'yocto-queue']) {
        expect(externals[pkg].alias).toBeDefined()
        expect(externals[pkg].aliasTraced).toBe(true)
        expect(externals[pkg].targetFiles).not.toHaveLength(0)
      }
    })

    it('should trace externals used only by a server action', async () => {
      const externals = await getTracedExternals(
        '.next/server/app/page.js.nft.json'
      )
      for (const pkg of ['lodash', 'yocto-queue']) {
        expect(externals[pkg].alias).toBeDefined()
        expect(externals[pkg].aliasTraced).toBe(true)
        expect(externals[pkg].targetFiles).not.toHaveLength(0)
      }
    })
  }
})
