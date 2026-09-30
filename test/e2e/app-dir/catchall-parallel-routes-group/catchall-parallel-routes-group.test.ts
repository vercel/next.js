import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import { check } from 'next-test-utils'

describe('catchall-parallel-routes-group', () => {
  const { next, isNextStart, isTurbopack } = nextTestSetup({
    files: __dirname,
  })

  if (isNextStart && !isTurbopack) {
    it('traces the canonical page and its dependencies from the slot entry', async () => {
      const routeDir = path.join(next.testDir, '.next/server/app/[...catchAll]')
      const slotDir = path.join(routeDir, '@slot/(group)')
      const rootTrace = await next.readJSON(
        '.next/server/app/[...catchAll]/page.js.nft.json'
      )
      const slotTrace = await next.readJSON(
        '.next/server/app/[...catchAll]/@slot/(group)/page.js.nft.json'
      )
      const slotFiles = new Set<string>(
        slotTrace.files.map((file: string) => path.resolve(slotDir, file))
      )
      const requiredFiles = [
        path.join(routeDir, 'page.js'),
        ...rootTrace.files.map((file: string) => path.resolve(routeDir, file)),
      ]

      expect(requiredFiles.filter((file) => !slotFiles.has(file))).toEqual([])
    })
  }

  it('should work without throwing any errors about invalid pages', async () => {
    const browser = await next.browser('/')

    await check(() => browser.elementByCss('body').text(), /Root Page/)
    await browser.elementByCss('[href="/foobar"]').click()

    // catch all matches page, but also slot with layout and group
    await check(() => browser.elementByCss('body').text(), /Catch-all Page/)
    await check(
      () => browser.elementByCss('body').text(),
      /Catch-all Slot Group Page/
    )
  })
})
