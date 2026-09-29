import { FileRef, nextTestSetup } from 'e2e-utils'
import { join } from 'node:path'

const errorMessage = `This function is what Next.js runs for every request handled by this proxy (previously called middleware).

Why this happens:
- You are migrating from \`middleware\` to \`proxy\`, but haven't updated the exported function.
- The file exists but doesn't export a function.
- The export is not a function (e.g., an object or constant).
- There's a syntax error preventing the export from being recognized.

To fix it:
- Ensure this file has either a default or "proxy" function export.

Learn more: https://nextjs.org/docs/messages/middleware-to-proxy`

describe('proxy-missing-export', () => {
  const sharedFiles = {
    app: new FileRef(join(__dirname, 'app')),
    'next.config.js': new FileRef(join(__dirname, 'next.config.js')),
  }

  describe.each([
    'default-function',
    'default-arrow',
    'named-function',
    'named-arrow',
  ])('%s export', (fixture) => {
    const { next } = nextTestSetup({
      files: {
        ...sharedFiles,
        'proxy.ts': new FileRef(join(__dirname, 'proxies', `${fixture}.ts`)),
      },
    })

    it('should render with a valid proxy export', async () => {
      const browser = await next.browser('/')
      expect(await browser.elementByCss('p').text()).toBe('hello world')
    })
  })

  describe.each(['named-middleware', 'aliased-handler'])(
    '%s export',
    (fixture) => {
      const { next, isNextDev, isTurbopack } = nextTestSetup({
        files: {
          ...sharedFiles,
          'proxy.ts': new FileRef(join(__dirname, 'proxies', `${fixture}.ts`)),
        },
        skipStart: true,
      })

      it('should error with an invalid proxy export', async () => {
        if (isNextDev) {
          // Turbopack can fail during compilation before a server is ready.
          await next.start().catch(() => {})
          await next.browser('/').catch(() => {})
        } else {
          await expect(next.start()).rejects.toThrow()
        }

        const cliOutput = next.cliOutput

        if (isTurbopack && !isNextDev) {
          expect(cliOutput).toContain(`./proxy.ts
Error: Proxy is missing expected function export name
${errorMessage}`)
        } else {
          expect(cliOutput)
            .toContain(`The file "./proxy.ts" must export a function, either as a default export or as a named "proxy" export.
${errorMessage}`)
        }
      }, 240_000)
    }
  )
})
