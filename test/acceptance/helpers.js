import * as fs from 'fs-extra'
import { nanoid } from 'nanoid'
import { findPort, killApp, launchApp } from 'next-test-utils'
import webdriver from 'next-webdriver'
import path from 'path'

const rootSandboxDirectory = path.join(__dirname, '__tmp__')

export async function sandbox(
  id = nanoid(),
  initialFiles = new Map(),
  defaultFiles = true,
  readyLog
) {
  const sandboxDirectory = path.join(rootSandboxDirectory, id)

  const pagesDirectory = path.join(sandboxDirectory, 'pages')
  await fs.remove(sandboxDirectory)
  await fs.mkdirp(pagesDirectory)

  if (defaultFiles) {
    await fs.writeFile(
      path.join(pagesDirectory, 'index.js'),
      `export { default } from '../index';`
    )
    await fs.writeFile(
      path.join(sandboxDirectory, 'index.js'),
      `export default () => 'new sandbox';`
    )
  }
  for (const [k, v] of initialFiles.entries()) {
    await fs.mkdirp(path.dirname(path.join(sandboxDirectory, k)))
    await fs.writeFile(path.join(sandboxDirectory, k), v)
  }

  const appPort = await findPort()
  const app = await launchApp(sandboxDirectory, appPort, {
    env: { __NEXT_TEST_WITH_DEVTOOL: 1 },
    bootupMarker: readyLog,
  })
  const browser = await webdriver(appPort, '/')
  return [
    {
      sandboxDirectory,
      async write(fileName, content) {
        // Update the file on filesystem
        const fullFileName = path.join(sandboxDirectory, fileName)
        const dir = path.dirname(fullFileName)
        await fs.mkdirp(dir)
        await fs.writeFile(fullFileName, content)
      },
      async patch(fileName, content) {
        // Register an event for HMR completion
        await browser.executeScript(function () {
          window.__HMR_STATE = 'pending'

          var timeout = setTimeout(() => {
            window.__HMR_STATE = 'timeout'
          }, 30 * 1000)
          window.__NEXT_HMR_CB = function () {
            clearTimeout(timeout)
            window.__HMR_STATE = 'success'
          }
        })

        await this.write(fileName, content)

        for (;;) {
          const status = await browser.executeScript(() => window.__HMR_STATE)
          if (!status) {
            await new Promise((resolve) => setTimeout(resolve, 750))

            // Wait for application to re-hydrate:
            await browser.executeAsyncScript(function () {
              var callback = arguments[arguments.length - 1]
              if (window.__NEXT_HYDRATED) {
                callback()
              } else {
                var timeout = setTimeout(callback, 30 * 1000)
                window.__NEXT_HYDRATED_CB = function () {
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
      async remove(fileName) {
        const fullFileName = path.join(sandboxDirectory, fileName)
        await fs.remove(fullFileName)
      },
      async evaluate() {
        const input = arguments[0]
        if (typeof input === 'function') {
          const result = await browser.executeScript(input)
          await new Promise((resolve) => setTimeout(resolve, 30))
          return result
        } else {
          throw new Error(
            `You must pass a function to be evaluated in the browser.`
          )
        }
      },
      async hasRedbox(expected = false) {
        let attempts = 3
        do {
          const has = await this.evaluate(() => {
            return Boolean(
              [].slice
                .call(document.querySelectorAll('nextjs-portal'))
                .find((p) =>
                  p.shadowRoot.querySelector(
                    '#nextjs__container_errors_label, #nextjs__container_build_error_label'
                  )
                )
            )
          })
          if (has) {
            return true
          }
          if (--attempts < 0) {
            break
          }

          await new Promise((resolve) => setTimeout(resolve, 1000))
        } while (expected)
        return false
      },
      async getRedboxDescription() {
        return await this.evaluate(() => {
          const portal = [].slice
            .call(document.querySelectorAll('nextjs-portal'))
            .find((p) =>
              p.shadowRoot.querySelector('[data-nextjs-dialog-header]')
            )
          const root = portal.shadowRoot
          return root
            .querySelector('#nextjs__container_errors_desc')
            .innerText.replace(/__WEBPACK_DEFAULT_EXPORT__/, 'Unknown')
        })
      },
      async getRedboxSource(includeHeader = false) {
        const header = includeHeader
          ? await this.evaluate(() => {
              const portal = [].slice
                .call(document.querySelectorAll('nextjs-portal'))
                .find((p) =>
                  p.shadowRoot.querySelector('[data-nextjs-dialog-header]')
                )
              const root = portal.shadowRoot
              return root
                .querySelector('[data-nextjs-dialog-header]')
                .innerText.replace(/__WEBPACK_DEFAULT_EXPORT__/, 'Unknown')
            })
          : ''

        const source = await this.evaluate(() => {
          const portal = [].slice
            .call(document.querySelectorAll('nextjs-portal'))
            .find((p) =>
              p.shadowRoot.querySelector(
                '#nextjs__container_errors_label, #nextjs__container_build_error_label'
              )
            )
          const root = portal.shadowRoot
          return root.querySelector(
            '[data-nextjs-codeframe], [data-nextjs-terminal]'
          ).innerText
        })

        if (includeHeader) {
          return `${header}\n\n${source}`
        }
        return source
      },
    },
    function cleanup() {
      async function _cleanup() {
        await browser.close()
        await killApp(app)
      }
      _cleanup().catch(() => {})
    },
  ]
}
