import { FileRef, nextTestSetup } from 'e2e-utils'
import { join } from 'node:path'
import { retry } from 'next-test-utils'

// Invalid exports must fail before a deployment can be produced.
// @force-gate !deploy
describe.each([
  ['root', '/en/shoes', 'lang', 'category'],
  ['middle', '/en/shoes/one', 'category', 'id'],
])('param-matching-prefix: %s', (fixture, url, missing, closed) => {
  const { next, isNextDev } = nextTestSetup({
    files: {
      app: new FileRef(join(__dirname, 'fixtures', fixture)),
      'next.config.ts': new FileRef(join(__dirname, 'next.config.ts')),
    },
    skipStart: true,
  })

  it('requires an explicit not-found policy for every preceding parameter', async () => {
    const message = `Parameter "${missing}" must explicitly configure "not-found" before parameter "${closed}"`
    if (isNextDev) {
      await next.start()
      expect((await next.fetch(url)).status).toBe(500)
      await retry(() => expect(next.cliOutput).toContain(message))
    } else {
      const { exitCode, cliOutput } = await next.build()
      expect(cliOutput).toContain(message)
      expect(exitCode).toBe(1)
    }
  })
})
