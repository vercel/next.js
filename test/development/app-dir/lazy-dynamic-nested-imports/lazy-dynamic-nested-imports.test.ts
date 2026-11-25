import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// Every page lazily imports a, b and c. a and c lazily import x, b lazily imports y, which lazily
// imports x, and x lazily imports x2. So x is reached from several nested parents on every page.
const LEVELS = ['a', 'b', 'c', 'y', 'x', 'x2'].map((level) => `level-${level}`)
const PAGES = [0, 1, 2, 3, 4].map((i) => `/page-${i}`)
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'lazy-dynamic-nested-imports',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
    })

    it('server-renders every nested level', async () => {
      for (const page of PAGES) {
        const $ = await next.render$(page)
        for (const level of LEVELS) {
          const texts = $(`.${level}-text`)
            .toArray()
            .map((element) => $(element).text())
          expect(texts.length).toBeGreaterThan(0)
          expect(texts.every((text) => text === level)).toBe(true)
        }
      }
    })

    it('hydrates every nested level without failed requests', async () => {
      for (const page of PAGES) {
        const failed: string[] = []
        const browser = await next.browser(page, {
          beforePageLoad(p) {
            p.on('response', (response) => {
              if (response.status() >= 400) {
                failed.push(`${response.status()} ${response.url()}`)
              }
            })
            p.on('requestfailed', (request) => {
              const errorText = request.failure()?.errorText ?? 'request failed'
              // Some chunk requests are aborted by the browser while lazy imports activate, also
              // without this fix; a cancelled request is not a failed one.
              if (errorText !== 'net::ERR_ABORTED') {
                failed.push(`${errorText} ${request.url()}`)
              }
            })
          },
        })
        // Activating the nested lazy imports can rebuild and reload the page several times, which
        // resets every button, so allow more than the default 3s for it to settle.
        await retry(async () => {
          // Buttons only react once their level has hydrated; click the ones that haven't yet.
          const labels: string[] = await browser.eval(`(() => {
            const buttons = [...document.querySelectorAll('button.level-button')]
            for (const button of buttons) {
              if (!button.textContent.endsWith('-clicked')) button.click()
            }
            return buttons.map((button) => button.textContent)
          })()`)
          for (const level of LEVELS) {
            expect(labels).toContain(`${level}-clicked`)
          }
          expect(labels.every((label) => label.endsWith('-clicked'))).toBe(true)
        }, 30_000)
        expect(failed).toEqual([])
        await browser.close()
      }
    })

    it('does not panic or log errors while activating nested lazy imports', () => {
      expect(next.cliOutput).not.toContain('panicked')
      expect(next.cliOutput).not.toContain('⨯')
    })
  }
)
