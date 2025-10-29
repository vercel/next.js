/* eslint-env jest */
import path from 'path'
import fs from 'fs-extra'
import webdriver from 'next-webdriver'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'e2e-utils'
import {
  findPort,
  initNextServerScript,
  killApp,
  renderViaHTTP,
} from 'next-test-utils'

describe('pnpm support', () => {
  let next: NextInstance | undefined

  afterEach(async () => {
    try {
      await next?.destroy()
    } catch (_) {}
  })

  it('should build with dependencies installed via pnpm', async () => {
    next = await createNext({
      files: {
        pages: new FileRef(path.join(__dirname, 'app/pages')),
        'next.config.js': new FileRef(
          path.join(__dirname, 'app/next.config.js')
        ),
      },
      packageJson: {
        scripts: {
          build: 'next build',
          start: 'next start',
        },
      },
      buildCommand: 'pnpm run build',
    })

    expect(await next.readFile('pnpm-lock.yaml')).toBeTruthy()

    expect(next.cliOutput).toMatch(/Compiled successfully/)

    const html = await renderViaHTTP(next.url, '/')
    expect(html).toContain('Hello World')

    const manifest = JSON.parse(
      await next.readFile('.next/next-server.js.nft.json')
    )
    for (const ignore of ['next/dist/pages', '.wasm', 'compiled/@ampproject']) {
      let matchingFile
      try {
        matchingFile = manifest.files.some((file) => file.includes(ignore))
        expect(!!matchingFile).toBe(false)
      } catch (err) {
        require('console').error(
          `Found unexpected file in manifest ${matchingFile} matched ${ignore}`
        )
        throw err
      }
    }
  })

  it('should execute client-side JS on each page in output: "standalone"', async () => {
    next = await createNext({
      files: {
        pages: new FileRef(path.join(__dirname, 'app-multi-page/pages')),
        '.npmrc': new FileRef(path.join(__dirname, 'app-multi-page/.npmrc')),
        'next.config.js': new FileRef(
          path.join(__dirname, 'app-multi-page/next.config.js')
        ),
      },
      packageJson: {
        scripts: {
          dev: 'next dev',
          build: 'next build',
          start: 'next start',
        },
      },
      buildCommand: 'pnpm run build',
    })
    await next.stop()
    expect(next.cliOutput).toMatch(/Compiled successfully/)

    let appPort
    let server
    let browser
    try {
      appPort = await findPort()
      const standaloneDir = path.join(
        next.testDir,
        '.next/standalone/',
        path.basename(next.testDir)
      )

      // simulate what happens in a Dockerfile
      await fs.remove(path.join(next.testDir, 'node_modules'))
      await fs.copy(
        path.join(next.testDir, './.next/static'),
        path.join(standaloneDir, './.next/static'),
        { overwrite: true }
      )
      server = await initNextServerScript(
        path.join(standaloneDir, 'server.js'),
        /- Local:/,
        {
          ...process.env,
          PORT: appPort,
        },
        undefined,
        {
          cwd: standaloneDir,
        }
      )

      await renderViaHTTP(appPort, '/')

      browser = await webdriver(appPort, '/', {
        waitHydration: false,
      })
      expect(await browser.waitForElementByCss('#world').text()).toBe('World')
      await browser.close()

      browser = await webdriver(appPort, '/about', {
        waitHydration: false,
      })
      expect(await browser.waitForElementByCss('#world').text()).toBe('World')
      await browser.close()
    } finally {
      if (server) {
        await killApp(server)
      }
    }
  })
})
