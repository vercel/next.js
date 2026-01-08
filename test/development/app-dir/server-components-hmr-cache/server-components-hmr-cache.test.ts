import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('server-components-hmr-cache', () => {
  const { next } = nextTestSetup({ files: __dirname, patchFileDelay: 1000 })
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
    it('should use cached fetch calls for fast refresh requests', async () => {
      const browser = await next.browser(`/${runtime}`)
      const valueBeforePatch = await browser.elementById('value').text()

      await next.patchFile(
        'components/shared-page.tsx',
        (content) => content.replace('foo', 'bar'),
        async () => {
          await retry(async () => {
            const updatedContent = await browser.elementById('content').text()
            expect(updatedContent).toBe('bar')
            // TODO: remove custom duration in case we increase the default.
          }, 5000)

          const valueAfterPatch = await browser.elementById('value').text()
          expect(valueBeforePatch).toEqual(valueAfterPatch)
        }
      )
    })

    it('should not use cached fetch calls for intentional refresh requests', async () => {
      const browser = await next.browser(`/${runtime}`)
      const valueBeforeRefresh = await browser.elementById('value').text()
      await browser.elementByCss(`button`).click().waitForIdleNetwork()

      await retry(async () => {
        const valueAfterRefresh = await browser.elementById('value').text()
        expect(valueBeforeRefresh).not.toEqual(valueAfterRefresh)
        // TODO: remove custom duration in case we increase the default.
      }, 5000)
    })

    describe('in after()', () => {
      beforeEach(() => {
        cliOutputLength = next.cliOutput.length
      })

      it('should use cached fetch calls for fast refresh requests', async () => {
        const browser = await next.browser(`/${runtime}`)
        const valueBeforePatch = await retry(() => getLoggedAfterValue())
        cliOutputLength = next.cliOutput.length

        await next.patchFile(
          'components/shared-page.tsx',
          (content) => content.replace('foo', 'bar'),
          async () => {
            await retry(async () => {
              const updatedContent = await browser.elementById('content').text()
              expect(updatedContent).toBe('bar')
              // TODO: remove custom duration in case we increase the default.
            }, 5000)

            const valueAfterPatch = await retry(() => getLoggedAfterValue())
            expect(valueBeforePatch).toEqual(valueAfterPatch)
          }
        )
      })

      it('should not use cached fetch calls for intentional refresh requests', async () => {
        const browser = await next.browser(`/${runtime}`)
        const valueBeforeRefresh = await retry(() => getLoggedAfterValue())
        cliOutputLength = next.cliOutput.length

        await browser.elementByCss(`button`).click().waitForIdleNetwork()

        await retry(async () => {
          const valueAfterRefresh = getLoggedAfterValue()
          expect(valueBeforeRefresh).not.toEqual(valueAfterRefresh)
          // TODO: remove custom duration in case we increase the default.
        }, 5000)
      })
    })

    describe('with cacheMaxMemorySize set to 0', () => {
      beforeAll(async () => {
        await next.patchFile('next.config.js', (content) =>
          content.replace('// cacheMaxMemorySize: 0,', 'cacheMaxMemorySize: 0,')
        )
      })

      afterAll(async () => {
        await next.patchFile('next.config.js', (content) =>
          content.replace('cacheMaxMemorySize: 0,', '// cacheMaxMemorySize: 0,')
        )
      })

      it('should not warn about "Single item size exceeds maxSize"', async () => {
        const initialOutputLength = next.cliOutput.length
        const browser = await next.browser(`/${runtime}`)
        await browser.elementById('value').text()

        await next.patchFile(
          'components/shared-page.tsx',
          (content) => content.replace('foo', 'bar'),
          async () => {
            await retry(async () => {
              const updatedContent = await browser.elementById('content').text()
              expect(updatedContent).toBe('bar')
            }, 5000)

            // Verify the warning does not appear
            const newOutput = next.cliOutput.slice(initialOutputLength)
            expect(newOutput).not.toContain('Single item size exceeds maxSize')
          }
        )
      })

      it('should still use cached fetch calls for fast refresh requests', async () => {
        const browser = await next.browser(`/${runtime}`)
        const valueBeforePatch = await browser.elementById('value').text()

        await next.patchFile(
          'components/shared-page.tsx',
          (content) => content.replace('foo', 'bar'),
          async () => {
            await retry(async () => {
              const updatedContent = await browser.elementById('content').text()
              expect(updatedContent).toBe('bar')
            }, 5000)

            // HMR cache should still work even with cacheMaxMemorySize: 0
            const valueAfterPatch = await browser.elementById('value').text()
            expect(valueBeforePatch).toEqual(valueAfterPatch)
          }
        )
      })
    })

    describe('with experimental.serverComponentsHmrCache disabled', () => {
      beforeAll(async () => {
        // Wait for server to be ready
        await next.fetch('/404')
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

        await next.patchFile(
          'components/shared-page.tsx',
          (content) => content.replace('foo', 'bar'),
          async () => {
            await retry(async () => {
              const updatedContent = await browser.elementById('content').text()
              expect(updatedContent).toBe('bar')
              // TODO: remove custom duration in case we increase the default.
            }, 5000)

            const valueAfterPatch = await browser.elementById('value').text()
            expect(valueBeforePatch).not.toEqual(valueAfterPatch)
          }
        )
      })

      describe('in after()', () => {
        beforeEach(() => {
          cliOutputLength = next.cliOutput.length
        })

        it('should not use cached fetch calls for fast refresh requests', async () => {
          const browser = await next.browser(`/${runtime}`)
          const valueBeforePatch = await retry(() => getLoggedAfterValue())
          cliOutputLength = next.cliOutput.length

          await next.patchFile(
            'components/shared-page.tsx',
            (content) => content.replace('foo', 'bar'),
            async () => {
              await retry(async () => {
                const updatedContent = await browser
                  .elementById('content')
                  .text()
                expect(updatedContent).toBe('bar')
                // TODO: remove custom duration in case we increase the default.
              }, 5000)

              const valueAfterPatch = await retry(() => getLoggedAfterValue())
              expect(valueBeforePatch).not.toEqual(valueAfterPatch)
            }
          )
        })
      })
    })
  })
})
