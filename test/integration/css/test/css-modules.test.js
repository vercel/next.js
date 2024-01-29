/* eslint-env jest */
import cheerio from 'cheerio'
import { readdir, readFile, remove } from 'fs-extra'
import {
  check,
  File,
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
  renderViaHTTP,
  waitFor,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

const fixturesDir = join(__dirname, '../..', 'css-fixtures')

// https://github.com/vercel/next.js/issues/12343
describe('Basic CSS Modules Ordering', () => {
  const appDir = join(fixturesDir, 'next-issue-12343')
  let app, appPort

  function tests() {
    async function checkGreenButton(browser) {
      await browser.waitForElementByCss('#link-other')
      const titleColor = await browser.eval(
        `window.getComputedStyle(document.querySelector('#link-other')).backgroundColor`
      )
      expect(titleColor).toBe('rgb(0, 255, 0)')
    }
    async function checkPinkButton(browser) {
      await browser.waitForElementByCss('#link-index')
      const titleColor = await browser.eval(
        `window.getComputedStyle(document.querySelector('#link-index')).backgroundColor`
      )
      expect(titleColor).toBe('rgb(255, 105, 180)')
    }

    it('should have correct color on index page (on load)', async () => {
      const browser = await webdriver(appPort, '/')
      try {
        await checkGreenButton(browser)
      } finally {
        await browser.close()
      }
    })

    it('should have correct color on index page (on hover)', async () => {
      const browser = await webdriver(appPort, '/')
      try {
        await checkGreenButton(browser)
        await browser.waitForElementByCss('#link-other').moveTo()
        await waitFor(2000)
        await checkGreenButton(browser)
      } finally {
        await browser.close()
      }
    })

    it('should have correct color on index page (on nav)', async () => {
      const browser = await webdriver(appPort, '/')
      try {
        await checkGreenButton(browser)
        await browser.waitForElementByCss('#link-other').click()

        // Wait for navigation:
        await browser.waitForElementByCss('#link-index')
        await checkPinkButton(browser)

        // Navigate back to index:
        await browser.waitForElementByCss('#link-index').click()
        await checkGreenButton(browser)
      } finally {
        await browser.close()
      }
    })
  }

  describe('Development Mode', () => {
    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(async () => {
      await killApp(app)
    })

    tests()
  })
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    beforeAll(async () => {
      await remove(join(appDir, '.next'))
    })
    beforeAll(async () => {
      await nextBuild(appDir, [], {})
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(async () => {
      await killApp(app)
    })

    tests()
  })
})

describe('should handle unresolved files gracefully', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    const workDir = join(fixturesDir, 'unresolved-css-url')

    it('should build correctly', async () => {
      await remove(join(workDir, '.next'))
      const { code } = await nextBuild(workDir)
      expect(code).toBe(0)
    })

    it('should have correct file references in CSS output', async () => {
      const cssFiles = await readdir(join(workDir, '.next/static/css'))

      for (const file of cssFiles) {
        if (file.endsWith('.css.map')) continue

        const content = await readFile(
          join(workDir, '.next/static/css', file),
          'utf8'
        )
        console.log(file, content)

        // if it is the combined global CSS file there are double the expected
        // results
        const howMany = content.includes('p{') || content.includes('p,') ? 2 : 1

        expect(content.match(/\(\/vercel\.svg/g).length).toBe(howMany)
        // expect(content.match(/\(vercel\.svg/g).length).toBe(howMany)
        expect(content.match(/\(\/_next\/static\/media/g).length).toBe(1)
        expect(content.match(/\(https:\/\//g).length).toBe(howMany)
      }
    })
  })
})

describe('Data URLs', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    const workDir = join(fixturesDir, 'data-url')

    it('should compile successfully', async () => {
      await remove(join(workDir, '.next'))
      const { code } = await nextBuild(workDir)
      expect(code).toBe(0)
    })

    it('should have emitted expected files', async () => {
      const cssFolder = join(workDir, '.next/static/css')
      const files = await readdir(cssFolder)
      const cssFiles = files.filter((f) => /\.css$/.test(f))

      expect(cssFiles.length).toBe(1)
      const cssContent = await readFile(join(cssFolder, cssFiles[0]), 'utf8')
      expect(cssContent.replace(/\/\*.*?\*\//g, '').trim()).toMatch(
        /background:url\("data:[^"]+"\)/
      )
    })
  })
})

describe('Ordering with Global CSS and Modules (dev)', () => {
  const appDir = join(fixturesDir, 'global-and-module-ordering')

  let appPort
  let app
  beforeAll(async () => {
    await remove(join(appDir, '.next'))
    appPort = await findPort()
    app = await launchApp(appDir, appPort)
  })
  afterAll(async () => {
    await killApp(app)
  })

  it('should not execute scripts in any order', async () => {
    const content = await renderViaHTTP(appPort, '/')
    const $ = cheerio.load(content)

    let asyncCount = 0
    let totalCount = 0
    for (const script of $('script').toArray()) {
      ++totalCount
      if ('async' in script.attribs) {
        ++asyncCount
      }
    }

    expect(asyncCount).toBe(0)
    expect(totalCount).not.toBe(0)
  })

  it('should have the correct color (css ordering)', async () => {
    const browser = await webdriver(appPort, '/')

    const currentColor = await browser.eval(
      `window.getComputedStyle(document.querySelector('#blueText')).color`
    )
    expect(currentColor).toMatchInlineSnapshot(`"rgb(0, 0, 255)"`)
  })

  it('should have the correct color (css ordering) during hot reloads', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/')

      const blueColor = await browser.eval(
        `window.getComputedStyle(document.querySelector('#blueText')).color`
      )
      expect(blueColor).toMatchInlineSnapshot(`"rgb(0, 0, 255)"`)

      const yellowColor = await browser.eval(
        `window.getComputedStyle(document.querySelector('#yellowText')).color`
      )
      expect(yellowColor).toMatchInlineSnapshot(`"rgb(255, 255, 0)"`)

      const cssFile = new File(join(appDir, 'pages/index.module.css'))
      try {
        cssFile.replace('color: yellow;', 'color: rgb(1, 1, 1);')
        await check(
          () =>
            browser.eval(
              `window.getComputedStyle(document.querySelector('#yellowText')).color`
            ),
          'rgb(1, 1, 1)'
        )
        await check(
          () =>
            browser.eval(
              `window.getComputedStyle(document.querySelector('#blueText')).color`
            ),
          'rgb(0, 0, 255)'
        )
      } finally {
        cssFile.restore()
      }
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })
})

describe('Ordering with Global CSS and Modules (prod)', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    const appDir = join(fixturesDir, 'global-and-module-ordering')

    let appPort
    let app
    let stdout
    let code
    beforeAll(async () => {
      await remove(join(appDir, '.next'))
      ;({ code, stdout } = await nextBuild(appDir, [], {
        stdout: true,
      }))
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(async () => {
      await killApp(app)
    })

    it('should have compiled successfully', () => {
      expect(code).toBe(0)
      expect(stdout).toMatch(/Compiled successfully/)
    })

    it('should have the correct color (css ordering)', async () => {
      const browser = await webdriver(appPort, '/')

      const currentColor = await browser.eval(
        `window.getComputedStyle(document.querySelector('#blueText')).color`
      )
      expect(currentColor).toMatchInlineSnapshot(`"rgb(0, 0, 255)"`)
    })
  })
})

// https://github.com/vercel/next.js/issues/12445
// This feature is not supported in Turbopack
;(process.env.TURBOPACK ? describe.skip : describe)(
  'CSS Modules Composes Ordering',
  () => {
    const appDir = join(fixturesDir, 'composes-ordering')
    let app, appPort

    function tests(isDev = false) {
      async function checkBlackTitle(browser) {
        await browser.waitForElementByCss('#black-title')
        const titleColor = await browser.eval(
          `window.getComputedStyle(document.querySelector('#black-title')).color`
        )
        expect(titleColor).toBe('rgb(17, 17, 17)')
      }
      async function checkRedTitle(browser) {
        await browser.waitForElementByCss('#red-title')
        const titleColor = await browser.eval(
          `window.getComputedStyle(document.querySelector('#red-title')).color`
        )
        expect(titleColor).toBe('rgb(255, 0, 0)')
      }

      it('should have correct color on index page (on load)', async () => {
        const browser = await webdriver(appPort, '/')
        try {
          await checkBlackTitle(browser)
        } finally {
          await browser.close()
        }
      })

      it('should have correct color on index page (on hover)', async () => {
        const browser = await webdriver(appPort, '/')
        try {
          await checkBlackTitle(browser)
          await browser.waitForElementByCss('#link-other').moveTo()
          await waitFor(2000)
          await checkBlackTitle(browser)
        } finally {
          await browser.close()
        }
      })

      if (!isDev) {
        it('should not change color on hover', async () => {
          const browser = await webdriver(appPort, '/')
          try {
            await checkBlackTitle(browser)
            await browser.waitForElementByCss('#link-other').moveTo()
            await waitFor(2000)
            await checkBlackTitle(browser)
          } finally {
            await browser.close()
          }
        })

        it('should have correct CSS injection order', async () => {
          const browser = await webdriver(appPort, '/')
          try {
            await checkBlackTitle(browser)

            const prevSiblingHref = await browser.eval(
              `document.querySelector('link[rel=stylesheet][data-n-p]').previousSibling.getAttribute('href')`
            )
            const currentPageHref = await browser.eval(
              `document.querySelector('link[rel=stylesheet][data-n-p]').getAttribute('href')`
            )
            expect(prevSiblingHref).toBeDefined()
            expect(prevSiblingHref).toBe(currentPageHref)

            // Navigate to other:
            await browser.waitForElementByCss('#link-other').click()
            await checkRedTitle(browser)

            const newPrevSibling = await browser.eval(
              `document.querySelector('style[data-n-href]').previousSibling.getAttribute('data-n-css')`
            )
            const newPageHref = await browser.eval(
              `document.querySelector('style[data-n-href]').getAttribute('data-n-href')`
            )
            expect(newPrevSibling).toBe('')
            expect(newPageHref).toBeDefined()
            expect(newPageHref).not.toBe(currentPageHref)

            // Navigate to home:
            await browser.waitForElementByCss('#link-index').click()
            await checkBlackTitle(browser)

            const newPrevSibling2 = await browser.eval(
              `document.querySelector('style[data-n-href]').previousSibling.getAttribute('data-n-css')`
            )
            const newPageHref2 = await browser.eval(
              `document.querySelector('style[data-n-href]').getAttribute('data-n-href')`
            )
            expect(newPrevSibling2).toBe('')
            expect(newPageHref2).toBeDefined()
            expect(newPageHref2).toBe(currentPageHref)
          } finally {
            await browser.close()
          }
        })
      }

      it('should have correct color on index page (on nav from index)', async () => {
        const browser = await webdriver(appPort, '/')
        try {
          await checkBlackTitle(browser)
          await browser.waitForElementByCss('#link-other').click()

          // Wait for navigation:
          await browser.waitForElementByCss('#link-index')
          await checkRedTitle(browser)

          // Navigate back to index:
          await browser.waitForElementByCss('#link-index').click()
          await checkBlackTitle(browser)
        } finally {
          await browser.close()
        }
      })

      it('should have correct color on index page (on nav from other)', async () => {
        const browser = await webdriver(appPort, '/other')
        try {
          await checkRedTitle(browser)
          await browser.waitForElementByCss('#link-index').click()

          // Wait for navigation:
          await browser.waitForElementByCss('#link-other')
          await checkBlackTitle(browser)

          // Navigate back to other:
          await browser.waitForElementByCss('#link-other').click()
          await checkRedTitle(browser)
        } finally {
          await browser.close()
        }
      })
    }

    describe('Development Mode', () => {
      beforeAll(async () => {
        await remove(join(appDir, '.next'))
      })
      beforeAll(async () => {
        appPort = await findPort()
        app = await launchApp(appDir, appPort)
      })
      afterAll(async () => {
        await killApp(app)
      })

      tests(true)
    })
    ;(process.env.TURBOPACK ? describe.skip : describe)(
      'production mode',
      () => {
        beforeAll(async () => {
          await remove(join(appDir, '.next'))
        })
        beforeAll(async () => {
          await nextBuild(appDir, [], {})
          appPort = await findPort()
          app = await nextStart(appDir, appPort)
        })
        afterAll(async () => {
          await killApp(app)
        })

        tests()
      }
    )
  }
)
