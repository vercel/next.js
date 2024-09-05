import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('ssg-single-pass', () => {
  const { next, skipped } = nextTestSetup({
    skipDeployment: true,
    files: __dirname,
  })

  if (skipped) {
    return
  }

  it('should only render the page once during build', async () => {
    expect(next.cliOutput).toIncludeRepeated('home page rendered', 1)
  })

  it('should only render the page once during an ISR revalidation', async () => {
    let logOccurrences = next.cliOutput.split('home page rendered').length - 1
    expect(logOccurrences).toBe(1)
    logOccurrences = 0
    const browser = await next.browser('/')
    const initialRandomNumber = await browser
      .elementById('random-number')
      .text()
    expect(initialRandomNumber).toMatch(/\d+/)
    // grab the index of the last log message so we can start
    // parsing future logs from there
    const outputIndex = next.cliOutput.length

    // trigger a revalidation
    const response = await (await next.fetch('/revalidate')).json()
    expect(response.success).toBe(true)

    await retry(async () => {
      // Retry until the data has been revalidated
      browser.refresh()

      const newRandomNumber = await browser.elementById('random-number').text()
      expect(newRandomNumber).toMatch(/\d+/)
      expect(newRandomNumber).not.toBe(initialRandomNumber)

      expect(next.cliOutput.slice(outputIndex)).toIncludeRepeated(
        'home page rendered',
        1
      )
    })
  })
})
