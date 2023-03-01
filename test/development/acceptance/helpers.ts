import {
  getRedboxDescription,
  getRedboxHeader,
  getRedboxSource,
  hasRedbox,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import { NextInstance } from 'test/lib/next-modes/base'

export async function sandbox(
  next: NextInstance,
  initialFiles?: Map<string, string>,
  defaultFiles = true
) {
  await next.stop()
  await next.clean()

  if (defaultFiles) {
    await next.patchFile(
      'pages/index.js',
      `export { default } from '../index';`
    )
    await next.patchFile('index.js', `export default () => 'new sandbox';`)
  }

  if (initialFiles) {
    for (const [k, v] of initialFiles.entries()) {
      await next.patchFile(k, v)
    }
  }
  await next.start()
  const browser = await webdriver(next.url, '/')
  return {
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
            await new Promise((resolve) => setTimeout(resolve, 750))

            // Wait for application to re-hydrate:
            await browser.evalAsync(function () {
              var callback = arguments[arguments.length - 1]
              if ((window as any).__NEXT_HYDRATED) {
                callback()
              } else {
                var timeout = setTimeout(callback, 30 * 1000)
                ;(window as any).__NEXT_HYDRATED_CB = function () {
                  clearTimeout(timeout)
                  callback()
                }
              }
            })

            console.log('Application re-loaded.')
            // Slow down tests a bit:
            await new Promise((resolve) => setTimeout(resolve, 750))
            return false
          }
          if (status === 'success') {
            console.log('Hot update complete.')
            break
          }
          if (status !== 'pending') {
            throw new Error(`Application is in inconsistent state: ${status}.`)
          }

          await new Promise((resolve) => setTimeout(resolve, 30))
        }

        // Slow down tests a bit (we don't know how long re-rendering takes):
        await new Promise((resolve) => setTimeout(resolve, 750))
        return true
      },
      async remove(filename) {
        await next.deleteFile(filename)
      },
      async evaluate(snippet: () => any) {
        if (typeof snippet === 'function') {
          const result = await browser.eval(snippet)
          await new Promise((resolve) => setTimeout(resolve, 30))
          return result
        } else {
          throw new Error(
            `You must pass a function to be evaluated in the browser.`
          )
        }
      },
      async hasRedbox(expected = false) {
        return hasRedbox(browser, expected)
      },
      async getRedboxDescription() {
        return getRedboxDescription(browser)
      },
      async getRedboxSource(includeHeader = false) {
        const header = includeHeader ? await getRedboxHeader(browser) : ''
        const source = await getRedboxSource(browser)

        if (includeHeader) {
          return `${header}\n\n${source}`
        }
        return source
      },
    },
    async cleanup() {
      await browser.close()
      await next.stop()
      await next.clean()
    },
  }
}
