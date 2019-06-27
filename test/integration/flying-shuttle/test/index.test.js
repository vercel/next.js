/* eslint-env jest */
/* global jasmine, test */
import webdriver from 'next-webdriver'
import path from 'path'
import {
  runNextCommand,
  stopApp,
  renderViaHTTP,
  waitFor
} from 'next-test-utils'
import stripAnsi from 'strip-ansi'
import startServer from '../server'
import fs from 'fs-extra'

const appDir = path.join(__dirname, '../')
let appPort
let secondAppPort
let server
let secondServer
jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5

describe('Flying Shuttle', () => {
  beforeAll(async () => {
    {
      await fs.remove(path.join(appDir, '.next-first'))
      await fs.mkdirp(path.join(appDir, '.next-first'))

      const { stdout } = await runNextCommand(['build', appDir], {
        stdout: true
      })
      const buildText = stripAnsi(stdout)
      expect(buildText).not.toMatch(/flying shuttle is docked/)
      await fs.copy(
        path.join(appDir, '.next'),
        path.join(appDir, '.next-first')
      )

      server = await startServer(0, path.join(appDir, '.next-first'))
      appPort = server.address().port
    }

    {
      await fs.remove(path.join(appDir, '.next-second'))
      await fs.mkdirp(path.join(appDir, '.next-second'))

      await fs.rename(
        path.join(appDir, 'pages', 'other.js'),
        path.join(appDir, 'pages', 'other.js.hide')
      )

      await fs.rename(
        path.join(appDir, 'pages', 'about', 'index.js'),
        path.join(appDir, 'pages', 'about', 'index.js.hide')
      )
      await fs.rename(
        path.join(appDir, 'pages', 'about', 'index.js2'),
        path.join(appDir, 'pages', 'about', 'index.js')
      )

      const { stdout } = await runNextCommand(['build', appDir], {
        stdout: true
      })
      const buildText = stripAnsi(stdout)
      expect(buildText).toMatch(/found 2 changed and 1 unchanged page/)
      await fs.copy(
        path.join(appDir, '.next'),
        path.join(appDir, '.next-second')
      )

      secondServer = await startServer(0, path.join(appDir, '.next-second'))
      secondAppPort = secondServer.address().port
    }
  })
  afterAll(async () => {
    if (server) await stopApp(server)
    if (secondServer) await stopApp(secondServer)

    await fs.remove(path.join(appDir, '.next-first'))
    await fs.remove(path.join(appDir, '.next-second'))

    await fs.rename(
      path.join(appDir, 'pages', 'other.js.hide'),
      path.join(appDir, 'pages', 'other.js')
    )
    await fs.rename(
      path.join(appDir, 'pages', 'about', 'index.js'),
      path.join(appDir, 'pages', 'about', 'index.js2')
    )
    await fs.rename(
      path.join(appDir, 'pages', 'about', 'index.js.hide'),
      path.join(appDir, 'pages', 'about', 'index.js')
    )
  })

  it('should render /index', async () => {
    const html = await renderViaHTTP(appPort, '/')
    expect(html).toMatch(/omega lol/)
    expect(html).toMatch(/Welcome to Next/)
  })
  it('should render /other', async () => {
    const html = await renderViaHTTP(appPort, '/other')
    expect(html).toMatch(/omega lol/)
    expect(html).toMatch(/Welcome to Other Next/)
  })
  it('should render /about', async () => {
    const html = await renderViaHTTP(appPort, '/about')
    expect(html).toMatch(/omega lol/)
    expect(html).toMatch(/All About/)
  })

  it('should hydrate correctly /index', async () => {
    const browser = await webdriver(appPort, '/')
    try {
      let text = await browser.text()
      await waitFor(3000)
      text = await browser.text()

      expect(text).toMatch(/omega lol/)
      expect(text).toMatch(/Welcome to Next/)
    } finally {
      await browser.close()
    }
  })
  it('should hydrate correctly /other', async () => {
    const browser = await webdriver(appPort, '/other')
    try {
      let text = await browser.text()
      await waitFor(3000)
      text = await browser.text()

      expect(text).toMatch(/omega lol/)
      expect(text).toMatch(/Welcome to Other Next/)
    } finally {
      await browser.close()
    }
  })
  it('should hydrate correctly /about', async () => {
    const browser = await webdriver(appPort, '/about')
    try {
      let text = await browser.text()
      await waitFor(3000)
      text = await browser.text()

      expect(text).toMatch(/omega lol/)
      expect(text).toMatch(/All About/)
    } finally {
      await browser.close()
    }
  })

  it('should not re-prefetch for the page its already on', async () => {
    const browser = await webdriver(appPort, '/')
    const links = await browser.elementsByCss('link[rel=preload]')
    let found = false

    for (const link of links) {
      const href = await link.getAttribute('href')
      if (href.endsWith('index.js')) {
        found = true
        break
      }
    }
    expect(found).toBe(false)
    if (browser) await browser.close()
  })

  it('should render /index', async () => {
    const html = await renderViaHTTP(secondAppPort, '/')
    expect(html).toMatch(/omega lol/)
    expect(html).toMatch(/Welcome to Next/)
  })
  it('should 404 /other', async () => {
    const html = await renderViaHTTP(secondAppPort, '/other')
    expect(html).toMatch(/Cannot GET \/other/)
  })
  it('should render /about', async () => {
    const html = await renderViaHTTP(secondAppPort, '/about')
    expect(html).toMatch(/omega lol/)
    expect(html).toMatch(/Everything About/)
  })

  it('should hydrate correctly /index', async () => {
    const browser = await webdriver(secondAppPort, '/')
    try {
      let text = await browser.text()
      await waitFor(3000)
      text = await browser.text()

      expect(text).toMatch(/omega lol/)
      expect(text).toMatch(/Welcome to Next/)
    } finally {
      await browser.close()
    }
  })
  it('should 404 on /other', async () => {
    const browser = await webdriver(secondAppPort, '/other')
    try {
      const text = await browser.text()
      expect(text).toMatch(/Cannot GET \/other/)
    } finally {
      await browser.close()
    }
  })
  it('should hydrate correctly /about', async () => {
    const browser = await webdriver(secondAppPort, '/about')
    try {
      let text = await browser.text()
      await waitFor(3000)
      text = await browser.text()

      expect(text).toMatch(/omega lol/)
      expect(text).toMatch(/Everything About/)
    } finally {
      await browser.close()
    }
  })
})
