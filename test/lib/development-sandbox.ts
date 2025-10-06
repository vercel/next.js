import {
  hasErrorToast,
  getRedboxComponentStack,
  getRedboxDescription,
  getRedboxHeader,
  getRedboxSource,
  getVersionCheckerText,
  assertHasRedbox,
  assertNoRedbox,
  waitFor,
  openRedbox,
  getRedboxDescriptionWarning,
  getRedboxErrorLink,
} from './next-test-utils'
import webdriver, { WebdriverOptions } from './next-webdriver'
import { NextInstance } from './next-modes/base'
import { Playwright } from 'next-webdriver'

export async function waitForHydration(browser: Playwright) {
  await browser.eval(() => {
    return new Promise<void>((resolve) => {
      if ((window as any).__NEXT_HYDRATED) {
        resolve()
      } else {
        var timeout = setTimeout(resolve, 30 * 1000)
        ;(window as any).__NEXT_HYDRATED_CB = function () {
          clearTimeout(timeout)
          resolve()
        }
      }
    })
  })
}

export async function createSandbox(
  next: NextInstance,
  initialFiles?: Map<string, string | ((contents: string) => string)>,
  initialUrl: string = '/',
  webDriverOptions: WebdriverOptions | undefined = undefined
) {
  let unwrappedByTypeScriptUsingKeyword = false

  try {
    await next.stop()
    await next.clean()
    if (initialFiles) {
      for (const [k, v] of initialFiles.entries()) {
        await next.patchFile(k, v)
      }
    }
    await next.start()

    const browser = await webdriver(next.url, initialUrl, webDriverOptions)

    async function evaluate<TFn extends (...args: any[]) => any>(
      fn: TFn,
      ...args: Parameters<TFn>
    ): Promise<ReturnType<TFn>>
    async function evaluate(fn: string): Promise<unknown>
    async function evaluate(
      snippet: string | ((...args: any) => any)
    ): Promise<any> {
      if (typeof snippet === 'function' || typeof snippet === 'string') {
        const result = await browser.eval(snippet)
        await waitFor(30)
        return result
      } else {
        throw new Error(
          `You must pass a string or function to be evaluated in the browser.`
        )
      }
    }

    return {
      browser,
      session: {
        async write(filename, content) {
          // Update the file on filesystem
          await next.patchFile(filename, content)
        },
        async patch(filename, content) {
          // Register an event for HMR completion
          await browser.eval(function () {
            ;(window as any).__HMR_STATE = 'pending'

            var timeout = setTimeout(() => {
              ;(window as any).__HMR_STATE = 'timeout'
            }, 30 * 1000)
            ;(window as any).__NEXT_HMR_CB = function () {
              clearTimeout(timeout)
              ;(window as any).__HMR_STATE = 'success'
            }
          })

          await this.write(filename, content)

          for (;;) {
            const status = await browser.eval(() => (window as any).__HMR_STATE)
            if (!status) {
              await waitFor(750)

              // Wait for application to re-hydrate:
              await waitForHydration(browser)

              console.log('Application re-loaded.')
              // Slow down tests a bit:
              await waitFor(750)
              return false
            }
            if (status === 'success') {
              console.log('Hot update complete.')
              break
            }
            if (status !== 'pending') {
              throw new Error(
                `Application is in inconsistent state: ${status}.`
              )
            }

            await waitFor(30)
          }

          // Slow down tests a bit (we don't know how long re-rendering takes):
          await waitFor(750)
          return true
        },
        async remove(filename) {
          await next.deleteFile(filename)
        },
        async renameFolder(...args: Parameters<(typeof next)['renameFolder']>) {
          await next.renameFolder(...args)
        },
        evaluate,
        async assertHasRedbox() {
          return assertHasRedbox(browser)
        },
        async assertNoRedbox() {
          return assertNoRedbox(browser)
        },
        async openRedbox() {
          return openRedbox(browser)
        },
        async hasErrorToast() {
          return Boolean(await hasErrorToast(browser))
        },
        async getRedboxDescription() {
          return getRedboxDescription(browser)
        },
        async getRedboxDescriptionWarning() {
          return getRedboxDescriptionWarning(browser)
        },
        async getRedboxErrorLink() {
          return getRedboxErrorLink(browser)
        },
        async getRedboxSource(includeHeader = false) {
          const header = includeHeader ? await getRedboxHeader(browser) : ''
          const source = await getRedboxSource(browser)

          if (includeHeader) {
            return `${header}\n\n${source}`
          }
          return source
        },
        /**
         * @returns `null` if there are no frames
         */
        getRedboxComponentStack() {
          return getRedboxComponentStack(browser)
        },
        async getVersionCheckerText() {
          return getVersionCheckerText(browser)
        },
      },
      get [Symbol.asyncDispose]() {
        unwrappedByTypeScriptUsingKeyword = true
        return async () => {
          await browser.close()
          await next.stop()
          await next.clean()
        }
      },
    }
  } finally {
    setImmediate(() => {
      if (!unwrappedByTypeScriptUsingKeyword) {
        throw new Error(
          'You must use `using` to create a sandbox, i.e., `await using sandbox = await createSandbox(`'
        )
      }
    })
  }
}
