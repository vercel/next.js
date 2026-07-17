import { nextTestSetup } from 'e2e-utils'

describe('use-cache-revalidate-zero-not-found', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('does not log an invalid revalidate error', async () => {
    const outputIndex = next.cliOutput.length
    const response = await next.fetch('/missing')

    await response.text()

    expect(next.cliOutput.slice(outputIndex)).not.toContain(
      'Invalid revalidate configuration provided: 0 < 1'
    )
  })
})
