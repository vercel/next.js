import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('fast-refresh-fetch-cache', () => {
  const { next } = nextTestSetup({ files: __dirname })

  describe.each(['edge', 'node'])('%s runtime', (runtime) => {
    afterEach(async () => {
      await next.patchFile('components/page.tsx', (content) =>
        content.replace('bar', 'foo')
      )
    })

    it('should use cached fetch calls for fast refresh requests', async () => {
      const browser = await next.browser(`/${runtime}`)
      const valueBeforePatch = await browser.elementById('value').text()

      await next.patchFile('components/page.tsx', (content) =>
        content.replace('foo', 'bar')
      )

      await retry(async () => {
        const updatedContent = await browser.elementById('content').text()
        expect(updatedContent).toBe('bar')
      })

      const valueAfterPatch = await browser.elementById('value').text()
      expect(valueBeforePatch).toEqual(valueAfterPatch)
    })

    it('should not use cached fetch calls for intentional refresh requests', async () => {
      const browser = await next.browser(`/${runtime}`)
      const valueBeforeRefresh = await browser.elementById('value').text()
      await browser.elementByCss(`button`).click().waitForIdleNetwork()

      await retry(async () => {
        const valueAfterRefresh = await browser.elementById('value').text()
        expect(valueBeforeRefresh).not.toEqual(valueAfterRefresh)
      })
    })

    describe('in after()', () => {
      const loggedAfterValueRegexp = /After: (\d\.\d+)/
      let cliOutputLength: number

      const getLoggedAfterValue = () =>
        next.cliOutput.slice(cliOutputLength).match(loggedAfterValueRegexp)?.[1]

      beforeEach(() => {
        cliOutputLength = next.cliOutput.length
      })

      it('should use cached fetch calls for fast refresh requests', async () => {
        const browser = await next.browser(`/${runtime}`)
        const valueBeforePatch = getLoggedAfterValue()
        cliOutputLength = next.cliOutput.length

        await next.patchFile('components/page.tsx', (content) =>
          content.replace('foo', 'bar')
        )

        await retry(async () => {
          const updatedContent = await browser.elementById('content').text()
          expect(updatedContent).toBe('bar')
        })

        const valueAfterPatch = getLoggedAfterValue()
        expect(valueBeforePatch).toEqual(valueAfterPatch)
      })

      it('should not use cached fetch calls for intentional refresh requests', async () => {
        const browser = await next.browser(`/${runtime}`)
        const valueBeforeRefresh = getLoggedAfterValue()
        cliOutputLength = next.cliOutput.length

        await browser.elementByCss(`button`).click().waitForIdleNetwork()

        await retry(async () => {
          const valueAfterRefresh = getLoggedAfterValue()
          expect(valueBeforeRefresh).not.toEqual(valueAfterRefresh)
        })
      })
    })
  })
})
