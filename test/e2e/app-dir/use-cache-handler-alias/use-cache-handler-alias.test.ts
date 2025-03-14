import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('use-cache-handler-alias', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    // Skip deployment so we can test the custom cache handlers log output
    skipDeployment: true,
  })

  if (skipped) return

  it('should use cache handler alias if provided', async () => {
    const outputIndex = next.cliOutput.length
    const browser = await next.browser(`/`)
    const initialData = await Promise.all(
      (await browser.elementsByCss('[data-item]')).map((el) => el.textContent())
    )
    for (const data of initialData) {
      expect(data).toMatch(/^\d+\.\d+$/)
    }

    expect(next.cliOutput.slice(outputIndex)).toContain(
      'CustomCacheHandler::Get'
    )
    expect(next.cliOutput.slice(outputIndex)).toContain(
      'CustomCacheHandler::Set'
    )

    let revalidateData = initialData
    await browser.elementById('revalidate-custom').click()
    await retry(async () => {
      await browser.refresh()
      revalidateData = await Promise.all(
        (await browser.elementsByCss('[data-item]')).map((el) =>
          el.textContent()
        )
      )
      for (const data of revalidateData) {
        expect(data).toMatch(/^\d+\.\d+$/)
      }
      expect(revalidateData).not.toEqual(initialData)
    })
    expect(next.cliOutput).toIncludeRepeated(
      // toIncludeRepeated is using a regex to match the output, so we need to escape the brackets
      `CustomCacheHandler::ExpireTags \\[ 'custom' \\]`,
      1
    )
  })
})

describe('use-cache-handler-alias circular alias', () => {
  const { next, isNextStart, skipped } = nextTestSetup({
    files: {
      'next.config.js': `
        module.exports = {
          experimental: {
            cacheHandlers: {
              circular1: 'circular2',
              circular2: 'circular1',
            }
          }
        }
      `,
      'app/page.jsx': `
        export default function Page() {
          return <div>Page</div>
        }
      `,
      'app/layout.jsx': `
        export default function Layout({ children }) {
          return <html><body>{children}</body></html>
        }
      `,
    },
    skipStart: true,
  })

  if (skipped) return

  it('start should fail when using circular cache handler alias', async () => {
    if (isNextStart) {
      await next.start().catch(() => {})
      expect(next.cliOutput).toContain(
        'Invalid handler fields configured for "experimental.cacheHandler"'
      )
      expect(next.cliOutput).toContain(
        'circular1: circular cache handler alias detected'
      )
    }
  })
})
