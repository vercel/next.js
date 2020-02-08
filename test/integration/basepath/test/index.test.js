/* eslint-env jest */
/* global jasmine */
import webdriver from 'next-webdriver'
import { join } from 'path'
import {
  nextServer,
  launchApp,
  findPort,
  killApp,
  nextBuild,
  startApp,
  stopApp,
  waitFor,
  check,
  getBrowserBodyText,
  renderViaHTTP,
  File,
  nextStart,
} from 'next-test-utils'
import fs, {
  readFileSync,
  writeFileSync,
  renameSync,
  existsSync,
} from 'fs-extra'
import cheerio from 'cheerio'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2

const appDir = join(__dirname, '..')

const runTests = (context, dev = false) => {
  if (!dev) {
    it('should add basePath to routes-manifest', async () => {
      const routesManifest = await fs.readJSON(
        join(appDir, '.next/routes-manifest.json')
      )
      expect(routesManifest.basePath).toBe('/docs')
    })
  }

  it('should show the hello page under the /docs prefix', async () => {
    const browser = await webdriver(context.appPort, '/docs/hello')
    try {
      const text = await browser.elementByCss('h1').text()
      expect(text).toBe('Hello World')
    } finally {
      await browser.close()
    }
  })

  it('should show the other-page page under the /docs prefix', async () => {
    const browser = await webdriver(context.appPort, '/docs/other-page')
    try {
      const text = await browser.elementByCss('h1').text()
      expect(text).toBe('Hello Other')
    } finally {
      await browser.close()
    }
  })

  it('should navigate to the page without refresh', async () => {
    const browser = await webdriver(context.appPort, '/docs/hello')
    try {
      await browser.eval('window.itdidnotrefresh = "hello"')
      const text = await browser
        .elementByCss('#other-page-link')
        .click()
        .waitForElementByCss('#other-page-title')
        .elementByCss('h1')
        .text()

      expect(text).toBe('Hello Other')
      expect(await browser.eval('window.itdidnotrefresh')).toBe('hello')
    } finally {
      await browser.close()
    }
  })
}

describe('basePath development', () => {
  let server

  let context = {}

  beforeAll(async () => {
    context.appPort = await findPort()
    server = await launchApp(join(__dirname, '..'), context.appPort)
  })
  afterAll(async () => {
    await killApp(server)
  })

  runTests(context, true)

  describe('Hot Module Reloading', () => {
    describe('delete a page and add it back', () => {
      it('should load the page properly', async () => {
        const contactPagePath = join(
          __dirname,
          '../',
          'pages',
          'hmr',
          'contact.js'
        )
        const newContactPagePath = join(
          __dirname,
          '../',
          'pages',
          'hmr',
          '_contact.js'
        )
        let browser
        try {
          browser = await webdriver(context.appPort, '/docs/hmr/contact')
          const text = await browser.elementByCss('p').text()
          expect(text).toBe('This is the contact page.')

          // Rename the file to mimic a deleted page
          renameSync(contactPagePath, newContactPagePath)

          await check(
            () => getBrowserBodyText(browser),
            /This page could not be found/
          )

          // Rename the file back to the original filename
          renameSync(newContactPagePath, contactPagePath)

          // wait until the page comes back
          await check(
            () => getBrowserBodyText(browser),
            /This is the contact page/
          )
        } finally {
          if (browser) {
            await browser.close()
          }
          if (existsSync(newContactPagePath)) {
            renameSync(newContactPagePath, contactPagePath)
          }
        }
      })
    })

    describe('editing a page', () => {
      it('should detect the changes and display it', async () => {
        let browser
        try {
          browser = await webdriver(context.appPort, '/docs/hmr/about')
          const text = await browser.elementByCss('p').text()
          expect(text).toBe('This is the about page.')

          const aboutPagePath = join(
            __dirname,
            '../',
            'pages',
            'hmr',
            'about.js'
          )

          const originalContent = readFileSync(aboutPagePath, 'utf8')
          const editedContent = originalContent.replace(
            'This is the about page',
            'COOL page'
          )

          // change the content
          writeFileSync(aboutPagePath, editedContent, 'utf8')

          await check(() => getBrowserBodyText(browser), /COOL page/)

          // add the original content
          writeFileSync(aboutPagePath, originalContent, 'utf8')

          await check(
            () => getBrowserBodyText(browser),
            /This is the about page/
          )
        } finally {
          if (browser) {
            await browser.close()
          }
        }
      })

      it('should not reload unrelated pages', async () => {
        let browser
        try {
          browser = await webdriver(context.appPort, '/docs/hmr/counter')
          const text = await browser
            .elementByCss('button')
            .click()
            .elementByCss('button')
            .click()
            .elementByCss('p')
            .text()
          expect(text).toBe('COUNT: 2')

          const aboutPagePath = join(
            __dirname,
            '../',
            'pages',
            'hmr',
            'about.js'
          )

          const originalContent = readFileSync(aboutPagePath, 'utf8')
          const editedContent = originalContent.replace(
            'This is the about page',
            'COOL page'
          )

          // Change the about.js page
          writeFileSync(aboutPagePath, editedContent, 'utf8')

          // wait for 5 seconds
          await waitFor(5000)

          // Check whether the this page has reloaded or not.
          const newText = await browser.elementByCss('p').text()
          expect(newText).toBe('COUNT: 2')

          // restore the about page content.
          writeFileSync(aboutPagePath, originalContent, 'utf8')
        } finally {
          if (browser) {
            await browser.close()
          }
        }
      })

      // Added because of a regression in react-hot-loader, see issues: #4246 #4273
      // Also: https://github.com/zeit/styled-jsx/issues/425
      it('should update styles correctly', async () => {
        let browser
        try {
          browser = await webdriver(context.appPort, '/docs/hmr/style')
          const pTag = await browser.elementByCss('.hmr-style-page p')
          const initialFontSize = await pTag.getComputedCss('font-size')

          expect(initialFontSize).toBe('100px')

          const pagePath = join(__dirname, '../', 'pages', 'hmr', 'style.js')

          const originalContent = readFileSync(pagePath, 'utf8')
          const editedContent = originalContent.replace('100px', '200px')

          // Change the page
          writeFileSync(pagePath, editedContent, 'utf8')

          try {
            // Check whether the this page has reloaded or not.
            await check(async () => {
              const editedPTag = await browser.elementByCss('.hmr-style-page p')
              return editedPTag.getComputedCss('font-size')
            }, /200px/)
          } finally {
            // Finally is used so that we revert the content back to the original regardless of the test outcome
            // restore the about page content.
            writeFileSync(pagePath, originalContent, 'utf8')
          }
        } finally {
          if (browser) {
            await browser.close()
          }
        }
      })

      // Added because of a regression in react-hot-loader, see issues: #4246 #4273
      // Also: https://github.com/zeit/styled-jsx/issues/425
      it('should update styles in a stateful component correctly', async () => {
        let browser
        const pagePath = join(
          __dirname,
          '../',
          'pages',
          'hmr',
          'style-stateful-component.js'
        )
        const originalContent = readFileSync(pagePath, 'utf8')
        try {
          browser = await webdriver(
            context.appPort,
            '/docs/hmr/style-stateful-component'
          )
          const pTag = await browser.elementByCss('.hmr-style-page p')
          const initialFontSize = await pTag.getComputedCss('font-size')

          expect(initialFontSize).toBe('100px')
          const editedContent = originalContent.replace('100px', '200px')

          // Change the page
          writeFileSync(pagePath, editedContent, 'utf8')

          // Check whether the this page has reloaded or not.
          await check(async () => {
            const editedPTag = await browser.elementByCss('.hmr-style-page p')
            return editedPTag.getComputedCss('font-size')
          }, /200px/)
        } finally {
          if (browser) {
            await browser.close()
          }
          writeFileSync(pagePath, originalContent, 'utf8')
        }
      })

      // Added because of a regression in react-hot-loader, see issues: #4246 #4273
      // Also: https://github.com/zeit/styled-jsx/issues/425
      it('should update styles in a dynamic component correctly', async () => {
        let browser = null
        let secondBrowser = null
        const pagePath = join(
          __dirname,
          '../',
          'components',
          'hmr',
          'dynamic.js'
        )
        const originalContent = readFileSync(pagePath, 'utf8')
        try {
          browser = await webdriver(
            context.appPort,
            '/docs/hmr/style-dynamic-component'
          )
          const div = await browser.elementByCss('#dynamic-component')
          const initialClientClassName = await div.getAttribute('class')
          const initialFontSize = await div.getComputedCss('font-size')

          expect(initialFontSize).toBe('100px')

          const initialHtml = await renderViaHTTP(
            context.appPort,
            '/docs/hmr/style-dynamic-component'
          )
          expect(initialHtml.includes('100px')).toBeTruthy()

          const $initialHtml = cheerio.load(initialHtml)
          const initialServerClassName = $initialHtml(
            '#dynamic-component'
          ).attr('class')

          expect(initialClientClassName === initialServerClassName).toBeTruthy()

          const editedContent = originalContent.replace('100px', '200px')

          // Change the page
          writeFileSync(pagePath, editedContent, 'utf8')

          // wait for 5 seconds
          await waitFor(5000)

          secondBrowser = await webdriver(
            context.appPort,
            '/docs/hmr/style-dynamic-component'
          )
          // Check whether the this page has reloaded or not.
          const editedDiv = await secondBrowser.elementByCss(
            '#dynamic-component'
          )
          const editedClientClassName = await editedDiv.getAttribute('class')
          const editedFontSize = await editedDiv.getComputedCss('font-size')
          const browserHtml = await secondBrowser
            .elementByCss('html')
            .getAttribute('innerHTML')

          expect(editedFontSize).toBe('200px')
          expect(browserHtml.includes('font-size:200px;')).toBe(true)
          expect(browserHtml.includes('font-size:100px;')).toBe(false)

          const editedHtml = await renderViaHTTP(
            context.appPort,
            '/docs/hmr/style-dynamic-component'
          )
          expect(editedHtml.includes('200px')).toBeTruthy()
          const $editedHtml = cheerio.load(editedHtml)
          const editedServerClassName = $editedHtml('#dynamic-component').attr(
            'class'
          )

          expect(editedClientClassName === editedServerClassName).toBe(true)
        } finally {
          // Finally is used so that we revert the content back to the original regardless of the test outcome
          // restore the about page content.
          writeFileSync(pagePath, originalContent, 'utf8')

          if (browser) {
            await browser.close()
          }

          if (secondBrowser) {
            secondBrowser.close()
          }
        }
      })
    })
  })
})

describe('basePath production', () => {
  let context = {}
  let server
  let app

  beforeAll(async () => {
    await nextBuild(appDir)
    app = nextServer({
      dir: join(__dirname, '../'),
      dev: false,
      quiet: true,
    })

    server = await startApp(app)
    context.appPort = server.address().port
  })

  afterAll(() => stopApp(server))

  runTests(context)
})

describe('basePath serverless', () => {
  let context = {}
  let app

  const nextConfig = new File(join(appDir, 'next.config.js'))

  beforeAll(async () => {
    await nextConfig.write(
      `module.exports = { target: 'serverless', experimental: { basePath: '/docs' } }`
    )
    await nextBuild(appDir)
    context.appPort = await findPort()
    app = await nextStart(appDir, context.appPort)
  })
  afterAll(async () => {
    await killApp(app)
    await nextConfig.restore()
  })

  runTests(context)
})
