import { nextTestSetup } from 'e2e-utils'

describe('app-dir - client-page-error-bailout', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  if (skipped) {
    return
  }

  let stderr = ''
  beforeAll(() => {
    const onLog = (log: string) => {
      stderr += log
    }

    next.on('stderr', onLog)
  })

  it('should bail out in static generation build', async () => {
    await next.build()
    expect(stderr).toContain(
      'Error occurred prerendering page "/". Read more: https://nextjs.org/docs/messages/prerender-error'
    )
    expect(stderr).toContain('Error: client-page-error')
  })
})
