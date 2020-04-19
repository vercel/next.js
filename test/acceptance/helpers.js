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
      async patch(fileName, content) {
        const fullFileName = path.join(sandboxDirectory, fileName)
        const dir = path.dirname(fullFileName)
        await fs.mkdirp(dir)
        await fs.writeFile(fullFileName, content)
        // TODO: intelligently wait for page to refresh
        await new Promise(resolve => setTimeout(resolve, 750))
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
