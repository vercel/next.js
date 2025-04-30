import { NextInstance, nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { createRequestTracker } from 'e2e-utils/request-tracker'
import stripAnsi from 'strip-ansi'
import { accountForOverhead } from './account-for-overhead'

const CONFIG_ERROR =
  'Server Actions Size Limit must be a valid number or filesize format larger than 1MB'

describe('app-dir action size limit invalid config', () => {
  const { next, isNextStart, isNextDeploy, isNextDev, skipped } = nextTestSetup(
    {
      files: __dirname,
      skipStart: true,
      dependencies: {
        nanoid: '4.0.1',
        'server-only': 'latest',
      },
    }
  )
  if (skipped) return

  const logs: string[] = []

  beforeAll(() => {
    const onLog = (log: string) => {
      logs.push(stripAnsi(log.trim()))
    }

    next.on('stdout', onLog)
    next.on('stderr', onLog)
  })

  afterEach(async () => {
    logs.length = 0

    await next.stop()
  })

  if (isNextStart) {
    it('should error if serverActions.bodySizeLimit config is a negative number', async function () {
      await using _ = await patchFileWithCleanup(
        next,
        'next.config.js',
        `
      module.exports = {
        experimental: {
          serverActions: { bodySizeLimit: -3000 }
        },
      }
      `
      )
      try {
        await next.start()
      } catch {}
      expect(next.cliOutput).toContain(CONFIG_ERROR)
    })

    it('should error if serverActions.bodySizeLimit config is invalid', async function () {
      await using _ = await patchFileWithCleanup(
        next,
        'next.config.js',
        `
      module.exports = {
        experimental: {
          serverActions: { bodySizeLimit: 'testmb' }
        },
      }
      `
      )
      try {
        await next.start()
      } catch {}
      expect(next.cliOutput).toContain(CONFIG_ERROR)
    })

    it('should error if serverActions.bodySizeLimit config is a negative size', async function () {
      await using _ = await patchFileWithCleanup(
        next,
        'next.config.js',
        `
      module.exports = {
        experimental: {
          serverActions: { bodySizeLimit: '-3000mb' }
        },
      }
      `
      )
      try {
        await next.start()
      } catch {}
      expect(next.cliOutput).toContain(CONFIG_ERROR)
    })
  }

  describe('should respect the size set in serverActions.bodySizeLimit for plaintext fetch actions', () => {
    beforeEach(async () => {
      await next.start()
    })

    it('should not error for requests that stay below the size limit', async () => {
      const browser = await next.browser('/file')
      const requestTracker = createRequestTracker(browser)

      // below the limit: ok
      const [, actionResponse] = await requestTracker.captureResponse(
        () => browser.elementByCss('#size-1mb').click(),
        { request: { method: 'POST', pathname: '/file' } }
      )
      expect(actionResponse.status()).toBe(200)
      expect(
        await actionResponse.request().headerValue('content-type')
      ).toStartWith('text/plain')

      if (!isNextDeploy) {
        await retry(() =>
          expect(logs).toContainEqual(
            expect.stringContaining(`size = ${accountForOverhead(1)}`)
          )
        )
        expect(logs).not.toContainEqual(
          expect.stringContaining('Error: Body exceeded 2mb limit')
        )
      }
    })

    it('should error for requests that exceed the size limit', async () => {
      const browser = await next.browser('/file')
      const requestTracker = createRequestTracker(browser)

      const [, actionResponse] = await requestTracker.captureResponse(
        () => browser.elementByCss('#size-3mb').click(),
        { request: { method: 'POST', pathname: '/file' } }
      )
      expect(actionResponse.status()).toBe(500) // TODO: 413?
      expect(
        await actionResponse.request().headerValue('content-type')
      ).toStartWith('text/plain')

      // The error should have been returned to the client and thrown, triggering the nearest error boundary.
      expect(await browser.elementByCss('#error').text()).toBe(
        'Something went wrong!'
      )

      if (!isNextDeploy) {
        await retry(() => {
          expect(logs).toContainEqual(
            expect.stringContaining('Error: Body exceeded 2mb limit')
          )
          expect(logs).toContainEqual(
            expect.stringContaining(
              'To configure the body size limit for Server Actions, see'
            )
          )
        })
        expect(logs).not.toContainEqual(expect.stringMatching(/^size = /))
      }
    })
  })

  describe.each([
    {
      description: 'multipart fetch actions',
      isJsEnabled: true,
    },
    {
      description: 'MPA actions',
      isJsEnabled: false,
    },
  ])(
    'should respect the size set in serverActions.bodySizeLimit for $description',
    ({ isJsEnabled }) => {
      beforeEach(async () => {
        await next.start()
      })

      it('should not error for requests that stay below the size limit', async () => {
        const browser = await next.browser('/form', {
          disableJavaScript: !isJsEnabled,
        })
        const requestTracker = createRequestTracker(browser)

        const [, actionResponse] = await requestTracker.captureResponse(
          () => browser.elementByCss('#size-1mb').click(),
          { request: { method: 'POST', pathname: '/form' } }
        )
        expect(actionResponse.status()).toBe(200)
        expect(
          await actionResponse.request().headerValue('content-type')
        ).toStartWith('multipart/form-data')

        if (!isNextDeploy) {
          await retry(() =>
            expect(logs).toContainEqual(
              expect.stringContaining(`size = ${accountForOverhead(1)}`)
            )
          )
          expect(logs).not.toContainEqual(
            expect.stringContaining('Error: Body exceeded 2mb limit')
          )
        }
      })

      it('should not error for requests that are at the size limit', async () => {
        const browser = await next.browser('/form', {
          disableJavaScript: !isJsEnabled,
        })
        const requestTracker = createRequestTracker(browser)

        const [, actionResponse] = await requestTracker.captureResponse(
          () => browser.elementByCss('#size-2mb').click(),
          { request: { method: 'POST', pathname: '/form' } }
        )
        expect(actionResponse.status()).toBe(200)
        expect(
          await actionResponse.request().headerValue('content-type')
        ).toStartWith('multipart/form-data')

        if (!isNextDeploy) {
          await retry(() =>
            expect(logs).toContainEqual(
              expect.stringContaining(`size = ${accountForOverhead(2)}`)
            )
          )
          expect(logs).not.toContainEqual(
            expect.stringContaining('Error: Body exceeded 2mb limit')
          )
        }
      })

      it('should error for requests that exceed the size limit', async () => {
        const browser = await next.browser('/form', {
          disableJavaScript: !isJsEnabled,
        })
        const requestTracker = createRequestTracker(browser)

        const [, actionResponse] = await requestTracker.captureResponse(
          () => browser.elementByCss('#size-3mb').click(),
          { request: { method: 'POST', pathname: '/form' } }
        )
        expect(actionResponse.status()).toBe(500) // TODO: 413?
        expect(
          await actionResponse.request().headerValue('content-type')
        ).toStartWith('multipart/form-data')

        if (isJsEnabled) {
          // The error should have been returned to the client and thrown, triggering the nearest error boundary.
          expect(await browser.elementByCss('#error').text()).toBe(
            'Something went wrong!'
          )
        } else {
          if (isNextDev) {
            // In dev, this triggers an error page with a JS overlay, but if JS is disabled, the page is empty.
            expect(await browser.elementByCss('#__next').text()).toBe('')
          } else {
            // TODO: We don't currently have a way to SSR a page with the correct error boundary triggered in response to an MPA action erroring.
            // Currently, we'll just show the "500 | Internal Server Error." page instead, which isn't ideal.
            expect(await browser.elementByCss('.next-error-h1').text()).toBe(
              '500'
            )
            expect(await browser.elementByCss('h2').text()).toBe(
              'Internal Server Error.'
            )
          }
        }

        if (!isNextDeploy) {
          await retry(() => {
            expect(logs).toContainEqual(
              expect.stringContaining('Error: Body exceeded 2mb limit')
            )
            expect(logs).toContainEqual(
              expect.stringContaining(
                'To configure the body size limit for Server Actions, see'
              )
            )
          })
          expect(logs).not.toContainEqual(expect.stringMatching(/^size = /))
        }
      })
    }
  )
})

async function patchFileWithCleanup(
  next: NextInstance,
  filename: Parameters<NextInstance['patchFile']>[0],
  contents: Parameters<NextInstance['patchFile']>[1]
): Promise<AsyncDisposable> {
  const originalFile = (await next.hasFile(filename))
    ? await next.readFile(filename)
    : null
  await next.patchFile(filename, contents)
  return {
    async [Symbol.asyncDispose]() {
      if (originalFile === null) {
        await next.deleteFile(filename)
      } else {
        await next.patchFile(filename, originalFile)
      }
    },
  }
}
