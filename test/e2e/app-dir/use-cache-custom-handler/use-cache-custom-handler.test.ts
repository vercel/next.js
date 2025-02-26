import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('use-cache-custom-handler', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    // Skip deployment so we can test the custom cache handlers log output
    skipDeployment: true,
  })

  if (skipped) return

  it('should use custom cache handler if provided', async () => {
    const outputIndex = next.cliOutput.length
    const browser = await next.browser(`/`)
    const initialData = await browser.elementById('data').text()
    expect(initialData).toMatch(/^\d+\.\d+$/)

    expect(next.cliOutput.slice(outputIndex)).toContain(
      'CustomCacheHandler::Get'
    )
    expect(next.cliOutput.slice(outputIndex)).toContain(
      'CustomCacheHandler::Set'
    )

    await retry(async () => {
      await browser.refresh()
      const data = await browser.elementById('data').text()
      expect(data).toMatch(/^\d+\.\d+$/)
      expect(data).not.toEqual(initialData)
    })
  })
})
