import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { join } from 'path'

describe('cache-handlers-upstream-wiring', () => {
  describe('pages router non-edge', () => {
    const { next, skipped, isNextDev } = nextTestSetup({
      files: join(__dirname, 'fixtures/pages-router-non-edge'),
      skipDeployment: true,
    })

    if (skipped) {
      return
    }

    let outputIndex = 0

    beforeEach(() => {
      outputIndex = next.cliOutput.length
    })

    it('wires res.revalidate() through the configured custom cacheHandler', async () => {
      const initialHtml = await next.render$('/isr')
      const initialValue = initialHtml('#now').text()
      outputIndex = next.cliOutput.length

      const revalidateResponse = await next.fetch('/api/revalidate')
      expect(revalidateResponse.status).toBe(200)
      expect(await revalidateResponse.json()).toEqual({ revalidated: true })

      if (!isNextDev) {
        await retry(async () => {
          const htmlAfterRevalidate = await next.render$('/isr')
          const valueAfterRevalidate = htmlAfterRevalidate('#now').text()
          expect(valueAfterRevalidate).not.toBe(initialValue)
        })
      }

      await next.render$('/isr')

      await retry(async () => {
        const output = next.cliOutput.slice(outputIndex)
        const constructorLogs =
          output.match(/WiringPagesIncrementalCacheHandler::constructor/g) ?? []
        const sawRevalidateTag = output.includes(
          'WiringPagesIncrementalCacheHandler::revalidateTag'
        )

        expect(sawRevalidateTag || constructorLogs.length > 0).toBe(true)
      })
    })
  })

  describe('cacheComponents enabled, non-edge app router', () => {
    const { next, skipped, isNextDev } = nextTestSetup({
      files: join(__dirname, 'fixtures/non-edge-cache-components'),
      skipDeployment: true,
    })

    if (skipped) {
      return
    }

    let outputIndex = 0

    beforeEach(() => {
      outputIndex = next.cliOutput.length
    })

    it('uses configured cacheHandlers for custom app-router cache kind', async () => {
      const pageResponse = await next.fetch('/')
      expect(pageResponse.status).toBe(200)

      await retry(async () => {
        const output = isNextDev
          ? next.cliOutput.slice(outputIndex)
          : next.cliOutput
        expect(output).toContain('WiringModernCacheHandler::set')
        expect(output).toContain('WiringModernCacheHandler::get')
      })
    })

    it('wires revalidateTag and revalidatePath to the custom cache handler', async () => {
      const seedResponse = await next.fetch('/revalidate-target')
      expect(seedResponse.status).toBe(200)

      const browser = await next.browser('/revalidate-actions')
      await browser.elementById('revalidate-tag').click()
      await browser.elementById('revalidate-path').click()

      await retry(async () => {
        const output = next.cliOutput.slice(outputIndex)
        const updateTagLogs =
          output.match(/WiringModernCacheHandler::updateTags/g) ?? []

        expect(updateTagLogs.length).toBeGreaterThanOrEqual(2)
        expect(output).toContain('custom-tag')
      })
    })
  })
  ;(process.env.__NEXT_CACHE_COMPONENTS ? describe.skip : describe)(
    'cacheComponents disabled, edge app router',
    () => {
      const { next, skipped } = nextTestSetup({
        files: join(__dirname, 'fixtures/edge-without-cache-components'),
        skipDeployment: true,
      })

      if (skipped) {
        return
      }

      let outputIndex = 0

      beforeEach(() => {
        outputIndex = next.cliOutput.length
      })

      it('uses configured cacheHandler for edge app page and edge app route', async () => {
        const edgePageResponse = await next.fetch('/edge-page')
        expect(edgePageResponse.status).toBe(200)

        const edgeRouteResponse = await next.fetch('/api/edge-route')
        expect(edgeRouteResponse.status).toBe(200)
        expect(await edgeRouteResponse.json()).toEqual({ ok: true })

        await retry(async () => {
          const output = next.cliOutput.slice(outputIndex)
          const constructorLogs =
            output.match(/WiringIncrementalCacheHandler::constructor/g) ?? []

          expect(constructorLogs.length).toBeGreaterThanOrEqual(2)
        })
      })
    }
  )
})
