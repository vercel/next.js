/* eslint-env jest */

import fs from 'fs-extra'
import {
  check,
  findPort,
  getBrowserBodyText,
  killApp,
  launchApp,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

const READ_ONLY_PERMISSIONS = 0o444
const READ_WRITE_PERMISSIONS = 0o644

const appDir = join(__dirname, '..')
const pagePath = join(appDir, 'pages/hello.js')

let appPort
let app

async function writeReadOnlyFile(path, content) {
  const exists = await fs
    .access(path)
    .then(() => true)
    .catch(() => false)

  if (exists) {
    await fs.chmod(path, READ_WRITE_PERMISSIONS)
  }

  await fs.writeFile(path, content, 'utf8')
  await fs.chmod(path, READ_ONLY_PERMISSIONS)
}

describe('Read-only source HMR', () => {
  beforeAll(async () => {
    await fs.chmod(pagePath, READ_ONLY_PERMISSIONS)

    appPort = await findPort()
    app = await launchApp(appDir, appPort, {
      env: {
        __NEXT_TEST_WITH_DEVTOOL: 1,
        // Events can be finicky in CI. This switches to a more reliable
        // polling method.
        CHOKIDAR_USEPOLLING: 'true',
        CHOKIDAR_INTERVAL: 500,
      },
    })
  })

  afterAll(async () => {
    await fs.chmod(pagePath, READ_WRITE_PERMISSIONS)
    await killApp(app)
  })

  it('should detect changes to a page', async () => {
    let browser

    try {
      browser = await webdriver(appPort, '/hello')
      await check(() => getBrowserBodyText(browser), /Hello World/)

      const originalContent = await fs.readFile(pagePath, 'utf8')
      const editedContent = originalContent.replace('Hello World', 'COOL page')

      if (process.env.TURBOPACK) {
        // TODO Turbopack needs a bit to start watching
        await new Promise((resolve) => setTimeout(resolve, 500))
      }

      await writeReadOnlyFile(pagePath, editedContent)
      await check(() => getBrowserBodyText(browser), /COOL page/)

      await writeReadOnlyFile(pagePath, originalContent)
      await check(() => getBrowserBodyText(browser), /Hello World/)
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  it('should handle page deletion and subsequent recreation', async () => {
    let browser

    try {
      browser = await webdriver(appPort, '/hello')
      await check(() => getBrowserBodyText(browser), /Hello World/)

      const originalContent = await fs.readFile(pagePath, 'utf8')

      if (process.env.TURBOPACK) {
        // TODO Turbopack needs a bit to start watching
        await new Promise((resolve) => setTimeout(resolve, 500))
      }

      await fs.remove(pagePath)
      await writeReadOnlyFile(pagePath, originalContent)
      await check(() => getBrowserBodyText(browser), /Hello World/)
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  it('should detect a new page', async () => {
    let browser
    const newPagePath = join(appDir, 'pages/new.js')

    try {
      await writeReadOnlyFile(
        newPagePath,
        `
        const New = () => <p>New page</p>

        export default New
      `
      )

      browser = await webdriver(appPort, '/new')
      await check(() => getBrowserBodyText(browser), /New page/)
    } finally {
      if (browser) {
        await browser.close()
      }
      await fs.remove(newPagePath)
    }
  })
})
