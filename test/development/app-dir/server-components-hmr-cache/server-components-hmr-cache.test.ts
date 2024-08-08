import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('server-components-hmr-cache', () => {
  const { next } = nextTestSetup({ files: __dirname })
  const loggedAfterValueRegexp = /After: (\d\.\d+)/
  let cliOutputLength: number

  const getLoggedAfterValue = () => {
    const match = next.cliOutput
      .slice(cliOutputLength)
      .match(loggedAfterValueRegexp)

    if (!match) {
      throw new Error('No logs from after() found')
    }
    return match[1]
  }

  describe.each(['edge', 'node'])('%s runtime', (runtime) => {
    afterEach(async () => {
      await next.patchFile('components/shared-page.tsx', (content) =>
        content.replace('bar', 'foo')
      )
    })

    // FIXME(lubieowoce)
    // we currently have some bugs around waitUntil in `runtime = edge`,
    // so some tests will fail due to this error:
    //   "unstable_after()` will not work correctly, because `waitUntil` is not available in the current environment."
    const itMaybe = runtime === 'edge' ? it.failing : it

    it('should use cached fetch calls for fast refresh requests', async () => {
      const browser = await next.browser(`/${runtime}`)
      const valueBeforePatch = await browser.elementById('value').text()

      await next.patchFile('components/shared-page.tsx', (content) =>
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
      beforeEach(() => {
        cliOutputLength = next.cliOutput.length
      })

      /* eslint-disable jest/no-standalone-expect */
      itMaybe(
        'should use cached fetch calls for fast refresh requests',
        async () => {
          const browser = await next.browser(`/${runtime}`)
          const valueBeforePatch = getLoggedAfterValue()
          cliOutputLength = next.cliOutput.length

          await next.patchFile('components/shared-page.tsx', (content) =>
            content.replace('foo', 'bar')
          )

          await retry(async () => {
            const updatedContent = await browser.elementById('content').text()

            expect(updatedContent).toBe('bar')
          })

          const valueAfterPatch = getLoggedAfterValue()
          expect(valueBeforePatch).toEqual(valueAfterPatch)
        }
      )

      itMaybe(
        'should not use cached fetch calls for intentional refresh requests',
        async () => {
          const browser = await next.browser(`/${runtime}`)
          const valueBeforeRefresh = getLoggedAfterValue()
          cliOutputLength = next.cliOutput.length

          await browser.elementByCss(`button`).click().waitForIdleNetwork()

          await retry(async () => {
            const valueAfterRefresh = getLoggedAfterValue()
            expect(valueBeforeRefresh).not.toEqual(valueAfterRefresh)
          })
        }
      )
      /* eslint-enable jest/no-standalone-expect */
    })

    describe('with experimental.serverComponentsHmrCache disabled', () => {
      beforeAll(async () => {
        await next.patchFile('next.config.js', (content) =>
          content.replace(
            '// serverComponentsHmrCache: false,',
            'serverComponentsHmrCache: false,'
          )
        )
      })

      afterAll(async () => {
        await next.patchFile('next.config.js', (content) =>
          content.replace(
            'serverComponentsHmrCache: false,',
            '// serverComponentsHmrCache: false,'
          )
        )
      })

      it('should not use cached fetch calls for fast refresh requests', async () => {
        const browser = await next.browser(`/${runtime}`)
        const valueBeforePatch = await browser.elementById('value').text()

        await next.patchFile('components/shared-page.tsx', (content) =>
          content.replace('foo', 'bar')
        )

        await retry(async () => {
          const updatedContent = await browser.elementById('content').text()
          expect(updatedContent).toBe('bar')
        })

        const valueAfterPatch = await browser.elementById('value').text()
        expect(valueBeforePatch).not.toEqual(valueAfterPatch)
      })

      describe('in after()', () => {
        beforeEach(() => {
          cliOutputLength = next.cliOutput.length
        })

        /* eslint-disable jest/no-standalone-expect */
        itMaybe(
          'should not use cached fetch calls for fast refresh requests',
          async () => {
            const browser = await next.browser(`/${runtime}`)
            const valueBeforePatch = getLoggedAfterValue()
            cliOutputLength = next.cliOutput.length

            await next.patchFile('components/shared-page.tsx', (content) =>
              content.replace('foo', 'bar')
            )

            await retry(async () => {
              const updatedContent = await browser.elementById('content').text()
              expect(updatedContent).toBe('bar')
            })

            const valueAfterPatch = getLoggedAfterValue()
            expect(valueBeforePatch).not.toEqual(valueAfterPatch)
          }
        )
        /* eslint-enable jest/no-standalone-expect */
      })
    })
  })
})
