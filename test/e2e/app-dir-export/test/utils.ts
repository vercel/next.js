/* eslint-env jest */

import { join } from 'path'
import { promisify } from 'util'
import fs from 'fs-extra'
import globOrig from 'glob'
import {
  waitForRedbox,
  getRedboxHeader,
  getRedboxSource,
  retry,
  findPort,
  startStaticServer,
  stopApp,
  fetchViaHTTP,
} from 'next-test-utils'
import { nextTestSetup } from 'e2e-utils'
import webdriver from 'next-webdriver'

const glob = promisify(globOrig)

export const expectedWhenTrailingSlashTrue = [
  '404.html',
  '404/index.html',
  '__next.__PAGE__.txt',
  '__next._full.txt',
  '__next._head.txt',
  '__next._index.txt',
  '__next._tree.txt',
  // Turbopack and plain next.js have different hash output for the file name
  // Turbopack will output favicon in the _next/static/media folder
  ...(process.env.IS_TURBOPACK_TEST
    ? [expect.stringMatching(/_next\/static\/media\/favicon\.[0-9a-f]+\.ico/)]
    : []),
  expect.stringMatching(/_next\/static\/media\/test\.[0-9a-f]+\.png/),
  '_next/static/test-build-id/_buildManifest.js',
  ...(process.env.IS_TURBOPACK_TEST
    ? ['_next/static/test-build-id/_clientMiddlewareManifest.json']
    : []),
  '_next/static/test-build-id/_ssgManifest.js',
  '_not-found/__next._full.txt',
  '_not-found/__next._head.txt',
  '_not-found/__next._index.txt',
  '_not-found/__next._not-found.__PAGE__.txt',
  '_not-found/__next._not-found.txt',
  '_not-found/__next._tree.txt',
  '_not-found/index.html',
  '_not-found/index.txt',
  'another/__next._full.txt',
  'another/__next._head.txt',
  'another/__next._index.txt',
  'another/__next._tree.txt',
  'another/__next.another.__PAGE__.txt',
  'another/__next.another.txt',
  'another/first/__next._full.txt',
  'another/first/__next._head.txt',
  'another/first/__next._index.txt',
  'another/first/__next._tree.txt',
  'another/first/__next.another.$d$slug.__PAGE__.txt',
  'another/first/__next.another.$d$slug.txt',
  'another/first/__next.another.txt',
  'another/first/index.html',
  'another/first/index.txt',
  'another/index.html',
  'another/index.txt',
  'another/second/__next._full.txt',
  'another/second/__next._head.txt',
  'another/second/__next._index.txt',
  'another/second/__next._tree.txt',
  'another/second/__next.another.$d$slug.__PAGE__.txt',
  'another/second/__next.another.$d$slug.txt',
  'another/second/__next.another.txt',
  'another/second/index.html',
  'another/second/index.txt',
  'api/json',
  'api/txt',
  'client/__next._full.txt',
  'client/__next._head.txt',
  'client/__next._index.txt',
  'client/__next._tree.txt',
  'client/__next.client.__PAGE__.txt',
  'client/__next.client.txt',
  'client/index.html',
  'client/index.txt',
  'favicon.ico',
  'image-import/__next._full.txt',
  'image-import/__next._head.txt',
  'image-import/__next._index.txt',
  'image-import/__next._tree.txt',
  'image-import/__next.image-import.__PAGE__.txt',
  'image-import/__next.image-import.txt',
  'image-import/index.html',
  'image-import/index.txt',
  'index.html',
  'index.txt',
  'robots.txt',
]

const expectedWhenTrailingSlashFalse = [
  '404.html',
  '__next.__PAGE__.txt',
  '__next._full.txt',
  '__next._head.txt',
  '__next._index.txt',
  '__next._tree.txt',
  // Turbopack will output favicon in the _next/static/media folder
  ...(process.env.IS_TURBOPACK_TEST
    ? [expect.stringMatching(/_next\/static\/media\/favicon\.[0-9a-f]+\.ico/)]
    : []),
  expect.stringMatching(/_next\/static\/media\/test\.[0-9a-f]+\.png/),
  '_next/static/test-build-id/_buildManifest.js',
  ...(process.env.IS_TURBOPACK_TEST
    ? ['_next/static/test-build-id/_clientMiddlewareManifest.json']
    : []),
  '_next/static/test-build-id/_ssgManifest.js',
  '_not-found.html',
  '_not-found.txt',
  '_not-found/__next._full.txt',
  '_not-found/__next._head.txt',
  '_not-found/__next._index.txt',
  '_not-found/__next._not-found.__PAGE__.txt',
  '_not-found/__next._not-found.txt',
  '_not-found/__next._tree.txt',
  'another.html',
  'another.txt',
  'another/__next._full.txt',
  'another/__next._head.txt',
  'another/__next._index.txt',
  'another/__next._tree.txt',
  'another/__next.another.__PAGE__.txt',
  'another/__next.another.txt',
  'another/first.html',
  'another/first.txt',
  'another/first/__next._full.txt',
  'another/first/__next._head.txt',
  'another/first/__next._index.txt',
  'another/first/__next._tree.txt',
  'another/first/__next.another.$d$slug.__PAGE__.txt',
  'another/first/__next.another.$d$slug.txt',
  'another/first/__next.another.txt',
  'another/second.html',
  'another/second.txt',
  'another/second/__next._full.txt',
  'another/second/__next._head.txt',
  'another/second/__next._index.txt',
  'another/second/__next._tree.txt',
  'another/second/__next.another.$d$slug.__PAGE__.txt',
  'another/second/__next.another.$d$slug.txt',
  'another/second/__next.another.txt',
  'api/json',
  'api/txt',
  'client.html',
  'client.txt',
  'client/__next._full.txt',
  'client/__next._head.txt',
  'client/__next._index.txt',
  'client/__next._tree.txt',
  'client/__next.client.__PAGE__.txt',
  'client/__next.client.txt',
  'favicon.ico',
  'image-import.html',
  'image-import.txt',
  'image-import/__next._full.txt',
  'image-import/__next._head.txt',
  'image-import/__next._index.txt',
  'image-import/__next._tree.txt',
  'image-import/__next.image-import.__PAGE__.txt',
  'image-import/__next.image-import.txt',
  'index.html',
  'index.txt',
  'robots.txt',
]

export async function getFiles(cwd) {
  const opts = { cwd, nodir: true }
  const files = ((await glob('**/*', opts)) as string[])
    .filter(
      (f) =>
        !f.startsWith('_next/static/chunks/') &&
        !f.startsWith('_next/static/development/') &&
        !f.startsWith('_next/static/webpack/')
    )
    .sort()
  return files
}
export function runTests({
  trailingSlash = true,
  dynamicPage,
  dynamicParams,
  dynamicApiRoute,
  generateStaticParamsOpt,
  expectedErrMsg,
}: {
  trailingSlash?: boolean
  dynamicPage?: string
  dynamicParams?: string
  dynamicApiRoute?: string
  generateStaticParamsOpt?: 'set noop' | 'set client'
  expectedErrMsg?: string | RegExp
}) {
  let { next, skipped, isNextDev } = nextTestSetup({
    files: join(__dirname, '..'),
    skipDeployment: true,
    skipStart: true,
  })
  if (skipped) {
    return
  }

  beforeAll(async () => {
    if (trailingSlash !== undefined) {
      await next.patchFile('next.config.js', (content) =>
        content.replace(
          'trailingSlash: true,',
          `trailingSlash: ${trailingSlash},`
        )
      )
    }

    if (dynamicPage !== undefined) {
      await next.patchFile('app/another/[slug]/page.js', (content) =>
        content.replace(
          `export const dynamic = 'force-static'`,
          dynamicPage === 'undefined'
            ? ''
            : `export const dynamic = ${dynamicPage}`
        )
      )
    }

    if (dynamicApiRoute !== undefined) {
      await next.patchFile('app/api/json/route.js', (content) =>
        content.replace(
          `export const dynamic = 'force-static'`,
          `export const dynamic = ${dynamicApiRoute}`
        )
      )
    }

    if (dynamicParams !== undefined) {
      await next.patchFile(
        'app/another/[slug]/page.js',
        (content) => `export const dynamicParams = ${dynamicParams}\n` + content
      )
    }

    if (generateStaticParamsOpt === 'set noop') {
      await next.patchFile('app/another/[slug]/page.js', (content) =>
        content.replace('export function generateStaticParams', 'function noop')
      )
    } else if (generateStaticParamsOpt === 'set client') {
      await next.patchFile(
        'app/another/[slug]/page.js',
        (content) => '"use client"\n' + content
      )
    }
  })

  let port: number
  let stopOrKill: (() => Promise<void>) | undefined
  beforeAll(async () => {
    if (isNextDev) {
      await next.start()
      port = Number(next.appPort)
    } else {
      await next.build()

      port = await findPort()
      const app = await startStaticServer(join(next.testDir, 'out'), null, port)
      stopOrKill = () => stopApp(app)
    }
  })
  afterAll(async () => {
    if (stopOrKill) {
      await stopOrKill()
    }
  })

  it('should work', async () => {
    if (expectedErrMsg) {
      if (isNextDev) {
        const url = dynamicPage ? '/another/first' : '/api/json'
        const browser = await webdriver(port, url)
        await waitForRedbox(browser)
        const header = await getRedboxHeader(browser)
        const source = await getRedboxSource(browser)
        if (expectedErrMsg instanceof RegExp) {
          expect(`${header}\n${source}`).toContain(expectedErrMsg)
        } else {
          expect(`${header}\n${source}`).toContain(expectedErrMsg)
        }
      } else {
        await retry(() => expect(next.cliOutput).toMatch(/error/i))
      }
      expect(next.cliOutput).toMatch(expectedErrMsg)
    } else {
      const a = (n: number) => `li:nth-child(${n}) a`
      const browser = await webdriver(port, '/')
      await retry(async () =>
        expect(await browser.elementByCss('h1').text()).toContain('Home')
      )
      expect(await browser.elementByCss(a(1)).text()).toBe(
        'another no trailingslash'
      )
      await browser.elementByCss(a(1)).click()

      await retry(async () =>
        expect(await browser.elementByCss('h1').text()).toContain('Another')
      )
      expect(await browser.elementByCss(a(1)).text()).toBe(
        'Visit the home page'
      )
      await browser.elementByCss(a(1)).click()

      await retry(async () =>
        expect(await browser.elementByCss('h1').text()).toContain('Home')
      )
      expect(await browser.elementByCss(a(2)).text()).toBe(
        'another has trailingslash'
      )
      await browser.elementByCss(a(2)).click()

      await retry(async () =>
        expect(await browser.elementByCss('h1').text()).toContain('Another')
      )
      expect(await browser.elementByCss(a(1)).text()).toBe(
        'Visit the home page'
      )
      await browser.elementByCss(a(1)).click()

      await retry(async () =>
        expect(await browser.elementByCss('h1').text()).toContain('Home')
      )
      expect(await browser.elementByCss(a(3)).text()).toBe('another first page')
      await browser.elementByCss(a(3)).click()
      await retry(async () =>
        expect(await browser.elementByCss('h1').text()).toContain('first')
      )
      expect(await browser.elementByCss(a(1)).text()).toBe('Visit another page')
      await browser.elementByCss(a(1)).click()

      await retry(async () =>
        expect(await browser.elementByCss('h1').text()).toContain('Another')
      )
      expect(await browser.elementByCss(a(4)).text()).toBe(
        'another second page'
      )
      await browser.elementByCss(a(4)).click()

      await retry(async () =>
        expect(await browser.elementByCss('h1').text()).toContain('second')
      )
      expect(await browser.elementByCss(a(1)).text()).toBe('Visit another page')
      await browser.elementByCss(a(1)).click()

      await retry(async () =>
        expect(await browser.elementByCss('h1').text()).toContain('Another')
      )
      expect(await browser.elementByCss(a(5)).text()).toBe('image import page')
      await browser.elementByCss(a(5)).click()

      await retry(async () =>
        expect(await browser.elementByCss('h1').text()).toContain(
          'Image Import'
        )
      )
      expect(await browser.elementByCss(a(2)).text()).toBe('View the image')
      expect(await browser.elementByCss(a(2)).getAttribute('href')).toMatch(
        /\/test\.(.*)\.png/
      )
      const res1 = await fetchViaHTTP(port, '/api/json')
      expect(res1.status).toBe(200)
      expect(await res1.json()).toEqual({ answer: 42 })

      const res2 = await fetchViaHTTP(port, '/api/txt')
      expect(res2.status).toBe(200)
      expect(await res2.text()).toEqual('this is plain text')

      if (!isNextDev) {
        let outputDir = join(next.testDir, 'out')
        if (trailingSlash) {
          expect(await getFiles(outputDir)).toEqual(
            expectedWhenTrailingSlashTrue
          )
        } else {
          expect(await getFiles(outputDir)).toEqual(
            expectedWhenTrailingSlashFalse
          )
        }
        const html404 = await fs.readFile(join(outputDir, '404.html'), 'utf8')
        expect(html404).toContain('<h1>My custom not found page</h1>')
      }
    }
  })
}
