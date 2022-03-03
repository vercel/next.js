/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import {
  nextServer,
  startApp,
  stopApp,
  nextBuild,
  waitFor,
} from 'next-test-utils'
import webdriver from 'next-webdriver'

let appDir = join(__dirname, '../base')
let appWithPartytownDir = join(__dirname, '../partytown')
let server
let appPort

async function bootApp(dir) {
  await nextBuild(dir)

  const app = nextServer({
    dir,
    dev: false,
    quiet: true,
  })

  server = await startApp(app)
  appPort = server.address().port
}

if (process.env.TEST_PARTYTOWN) {
  describe('Next.js Script - Worker strategy', () => {
    it('Partytown snippet is not injected to head if not enabled in configuration', async () => {
      let browser

      await bootApp(appDir)

      try {
        browser = await webdriver(appPort, '/')

        const script = await browser.eval(
          `document.querySelector('script[data-partytown]')`
        )

        expect(script).toEqual(null)
      } finally {
        if (browser) await browser.close()
        stopApp(server)
      }
    })

    it('Partytown snippet is injected to head if enabled in configuration', async () => {
      let { partytownSnippet } = require(join(
        appWithPartytownDir,
        'node_modules/@builder.io/partytown/integration'
      ))

      let browser

      await bootApp(appWithPartytownDir)

      try {
        browser = await webdriver(appPort, '/')

        const snippetScript = await browser.eval(
          `document.querySelector('script[data-partytown]').innerHTML`
        )

        expect(snippetScript).not.toEqual(null)
        expect(snippetScript).toEqual(partytownSnippet())
      } finally {
        if (browser) await browser.close()
        stopApp(server)
        fs.rmSync(join(appWithPartytownDir, 'public/~partytown'), {
          recursive: true,
          force: true,
        })
      }
    })

    it('Worker scripts are modified by Partytown to execute on a worker thread', async () => {
      let browser

      await bootApp(appWithPartytownDir)

      try {
        browser = await webdriver(appPort, '/')

        const predefinedWorkerScripts = await browser.eval(
          `document.querySelectorAll('script[type="text/partytown"]').length`
        )

        expect(predefinedWorkerScripts).toEqual(1)

        await waitFor(1000)

        // Partytown modifes type to "text/partytown-x" after it has been executed in the web worker
        const processedWorkerScripts = await browser.eval(
          `document.querySelectorAll('script[type="text/partytown-x"]').length`
        )

        expect(processedWorkerScripts).toEqual(1)
      } finally {
        if (browser) await browser.close()
        stopApp(server)
        fs.rmSync(join(appWithPartytownDir, 'public/~partytown'), {
          recursive: true,
          force: true,
        })
      }
    })
  })
} else {
  it('Should skip testing partytown without process.env.TEST_PARTYTOWN set', () => {})
}
