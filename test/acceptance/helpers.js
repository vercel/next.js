import * as fs from 'fs-extra'
import nanoid from 'nanoid'
import { findPort, killApp, launchApp } from 'next-test-utils'
import webdriver from 'next-webdriver'
import path from 'path'

const rootSandboxDirectory = path.join(__dirname, '__tmp__')

export async function sandbox(id = nanoid()) {
  const sandboxDirectory = path.join(rootSandboxDirectory, id)

  const pagesDirectory = path.join(sandboxDirectory, 'pages')
  await fs.remove(sandboxDirectory)
  await fs.mkdirp(pagesDirectory)

  await fs.writeFile(
    path.join(pagesDirectory, 'index.js'),
    `export { default } from '../index';`
  )
  await fs.writeFile(
    path.join(sandboxDirectory, 'index.js'),
    `export default () => 'new sandbox';`
  )

  const appPort = await findPort()
  const app = await launchApp(sandboxDirectory, appPort)
  const browser = await webdriver(appPort, '/')

  return [
    {
      async write(fileName, content) {
        // Update the file on filesystem
        const fullFileName = path.join(sandboxDirectory, fileName)
        const dir = path.dirname(fullFileName)
        await fs.mkdirp(dir)
        await fs.writeFile(fullFileName, content)
      },
      async patch(fileName, content) {
        // Register an event for HMR completion
        await browser.executeScript(function() {
          window.__HMR_STATE = 'pending'

          var timeout = setTimeout(() => {
            window.__HMR_STATE = 'timeout'
          }, 10000)
          window.__NEXT_HMR_CB = function() {
            clearTimeout(timeout)
            window.__HMR_STATE = 'success'
          }
        })

        await this.write(fileName, content)

        for (;;) {
          const status = await browser.executeScript(() => window.__HMR_STATE)
          if (!status) {
            await new Promise(resolve => setTimeout(resolve, 750))

            // Wait for application to re-hydrate:
            await browser.executeAsyncScript(function() {
              var callback = arguments[arguments.length - 1]
              if (window.__NEXT_HYDRATED) {
                callback()
              } else {
                var timeout = setTimeout(callback, 10 * 1000)
                window.__NEXT_HYDRATED_CB = function() {
                  clearTimeout(timeout)
                  callback()
                }
              }
            })

            console.log('Application re-loaded.')
            // Slow down tests a bit:
            await new Promise(resolve => setTimeout(resolve, 750))
            return false
          }
          if (status === 'success') {
            console.log('Hot update complete.')
            break
          }
          if (status !== 'pending') {
            throw new Error(`Application is in inconsistent state: ${status}.`)
          }

          await new Promise(resolve => setTimeout(resolve, 30))
        }

        // Slow down tests a bit (we don't know how long re-rendering takes):
        await new Promise(resolve => setTimeout(resolve, 750))
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
          await new Promise(resolve => setTimeout(resolve, 30))
          return result
        } else {
          throw new Error(
            `You must pass a function to be evaluated in the browser.`
          )
        }
      },
      async getOverlayContent() {
        await browser.waitForElementByCss('iframe', 10000)
        const hasIframe = await browser.hasElementByCssSelector('iframe')
        if (!hasIframe) {
          throw new Error('Unable to find overlay')
        }
        return browser.eval(
          `document.querySelector('iframe').contentWindow.document.body.innerHTML`
        )
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
