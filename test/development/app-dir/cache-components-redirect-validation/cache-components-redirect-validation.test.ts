import { nextTestSetup } from 'e2e-utils'
import { getDevCliValidationOutput } from 'e2e-utils/instant-validation'

describe('Cache Components - redirect() in a page', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: { NEXT_TEST_LOG_VALIDATION: '1' },
  })

  it('responds with a redirect without logging an instant validation error', async () => {
    const cliOutputIndex = next.cliOutput.length

    const res = await next.fetch('/go', { redirect: 'manual' })
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('/target')

    const validationOutput = await getDevCliValidationOutput('/go', () =>
      next.cliOutput.slice(cliOutputIndex)
    )

    // `redirect()` is the intended result of the render, not a failure, so
    // instant validation must not report it.
    expect(validationOutput).toBe('')
  })
})
