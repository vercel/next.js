import { nextTestSetup } from 'e2e-utils'
import { getDevCliValidationOutput } from 'e2e-utils/instant-validation'

describe('Cache Components - redirect() in a page', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: { NEXT_TEST_LOG_VALIDATION: '1' },
  })

  it('responds with a redirect and logs an instant validation error for it', async () => {
    const cliOutputIndex = next.cliOutput.length

    const res = await next.fetch('/go', { redirect: 'manual' })
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('/target')

    const validationOutput = await getDevCliValidationOutput('/go', () =>
      next.cliOutput.slice(cliOutputIndex)
    )

    // TODO(cache-components): `redirect()` is the intended result of the
    // render, not a failure, so instant validation should not report it. The
    // assertion below captures the current (incorrect) behavior; once fixed,
    // this should assert that no validation error is logged.
    expect(validationOutput).toContain(
      'Could not validate `instant` because an error prevented the target segment from rendering.'
    )
  })
})
