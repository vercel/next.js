import { nextTestSetup } from 'e2e-utils'

describe('cache-components-route-prerender-errors', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it.each([
    ['handler-error', 'handler failed after an immediate'],
    ['body-error', 'body failed after an immediate'],
    ['image-error', 'image component failed during serialization'],
    ['invalid-response', 'Expected a Response object but received'],
  ])('fails the build for %s', async (fixture, message) => {
    await next.patchFile(
      'app/failure/route.ts',
      await next.readFile(`fixtures/${fixture}.ts`)
    )

    const { exitCode, cliOutput } = await next.build()

    expect(exitCode).toBe(1)
    expect(cliOutput).toContain(message)
    expect(cliOutput).not.toContain('unhandledRejection')
  })
})
