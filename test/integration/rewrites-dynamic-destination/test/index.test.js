/* eslint-env jest */

import { join } from 'path'
import {
  killApp,
  findPort,
  nextBuild,
  nextStart,
  launchApp,
  File,
} from 'next-test-utils'
import webdriver from 'next-webdriver'

const appDir = join(__dirname, '../')
const nextConfig = new File(join(appDir, 'next.config.js'))

const i18nConfig = {
  locales: ['nl', 'fr', 'en', 'go'],
  defaultLocale: 'en',
}
const paths = [
  {
    id: '#old-fallback-blocking',
    path: '/old-path/first/fallback-blocking',
    expectedProps: { slug: 'first' },
  },
  {
    id: '#old-fallback',
    path: '/old-path/first/fallback',
    expectedProps: { slug: 'first' },
  },
  {
    id: '#old-no-fallback',
    path: '/old-path/first/no-fallback',
    expectedProps: { slug: 'first' },
  },
  {
    id: '#old-ssr',
    path: '/old-path/first/ssr',
    expectedProps: { slug: 'first' },
  },
  {
    id: '#unknown',
    path: '/old-path/first/unknown',
    expectedProps: { slug: 'first' },
  },
]
const notFoundPaths = [
  { path: '/old-path/not-found/fallback' },
  { path: '/old-path/fourth/no-fallback' },
]

const runTests = (ctx, additionalProps = {}) => {
  const { locale } = additionalProps
  it('should rewrite at the server side', async () => {
    for (const { path, expectedProps } of paths) {
      const currentPath = `${ctx.basePath || ''}${
        locale ? `/${locale}` : ''
      }${path}`
      const browser = await webdriver(ctx.appPort, currentPath)
      await browser.eval('window.beforeNav = 1')

      expect(await browser.elementByCss('#version').text()).toBe('new')
      const props = JSON.parse(await browser.elementByCss('#props').text())
      expect(props).toMatchObject({
        ...expectedProps,
        ...additionalProps,
      })
      const router = JSON.parse(await browser.elementByCss('#router').text())
      expect(router).toMatchObject({ asPath: path })
    }
  })
  it('should rewrite at the client side', async () => {
    const firstPagePath = `${ctx.basePath || '/'}${locale || ''}`
    const browser = await webdriver(ctx.appPort, firstPagePath)
    await browser.eval('window.beforeNav = 1')
    for (const { id, path, expectedProps } of paths) {
      await browser.eval('window.beforeNav = 1')
      await browser.elementByCss(id).click().eval('window.beforeNav = 1')

      expect(await browser.elementByCss('#version').text()).toBe('new')
      const props = JSON.parse(await browser.elementByCss('#props').text())
      expect(props).toMatchObject({
        ...expectedProps,
        ...additionalProps,
      })
      const router = JSON.parse(await browser.elementByCss('#router').text())
      expect(router).toMatchObject({ asPath: path })
      await browser.back().eval('window.beforeNav = 1')
    }
  })
  it('should return 404', async () => {
    for (const { path } of notFoundPaths) {
      const currentPath = `${ctx.basePath || ''}${
        locale ? `/${locale}` : ''
      }${path}`
      const browser = await webdriver(ctx.appPort, currentPath)
      browser.waitForElementByCss('#not-found')
      const props = JSON.parse(await browser.elementByCss('#props').text())
      expect(props).toMatchObject({
        is404: true,
        ...additionalProps,
      })
      const router = JSON.parse(await browser.elementByCss('#router').text())
      expect(router).toMatchObject({ asPath: path })
    }
  })
}

describe('Rewrites with dynamic destination', () => {
  describe('dev mode', () => {
    const ctx = {
      appPort: '',
      app: null,
    }
    beforeAll(async () => {
      ctx.appPort = await findPort()
      ctx.app = await launchApp(appDir, ctx.appPort)
    })
    afterAll(() => killApp(ctx.app))

    runTests(ctx)
  })

  describe('production mode', () => {
    const ctx = {
      appPort: '',
      app: null,
    }
    beforeAll(async () => {
      ctx.appPort = await findPort()
      await nextBuild(appDir)
      ctx.app = await nextStart(appDir, ctx.appPort)
    })
    afterAll(() => killApp(ctx.app))

    runTests(ctx)
  })

  describe('with basePath', () => {
    const ctx = {
      appPort: '',
      app: null,
      basePath: '',
    }
    beforeAll(async () => {
      ctx.appPort = await findPort()

      nextConfig.replace('// basePath', "basePath: '/abc',")
      await nextBuild(appDir)
      ctx.basePath = '/abc'
      ctx.app = await nextStart(appDir, ctx.appPort)
    })
    afterAll(() => {
      killApp(ctx.app)
      nextConfig.restore()
    })

    runTests(ctx)
  })
  describe('with i18n', () => {
    const ctx = {
      appPort: '',
      app: null,
      basePath: '',
    }
    beforeAll(async () => {
      ctx.appPort = await findPort()

      nextConfig.replace('// i18n', `i18n: ${JSON.stringify(i18nConfig)},`)
      await nextBuild(appDir)
      ctx.app = await nextStart(appDir, ctx.appPort)
    })
    afterAll(() => {
      killApp(ctx.app)
      nextConfig.restore()
    })

    runTests(ctx, { defaultLocale: i18nConfig.defaultLocale })
    runTests(ctx, {
      defaultLocale: i18nConfig.defaultLocale,
      locale: i18nConfig.defaultLocale,
    })
    runTests(ctx, { defaultLocale: i18nConfig.defaultLocale, locale: 'go' })
  })
})
