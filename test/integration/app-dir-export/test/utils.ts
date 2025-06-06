/* eslint-env jest */

import { join } from 'path'
import { promisify } from 'util'
import fs from 'fs-extra'
import webdriver from 'next-webdriver'
import globOrig from 'glob'
import {
  waitForRedbox,
  check,
  fetchViaHTTP,
  File,
  findPort,
  getRedboxHeader,
  getRedboxSource,
  killApp,
  launchApp,
  nextBuild,
  startStaticServer,
  stopApp,
} from 'next-test-utils'

const glob = promisify(globOrig)
export const appDir = join(__dirname, '..')
export const distDir = join(appDir, '.next')
export const exportDir = join(appDir, 'out')
export const nextConfig = new File(join(appDir, 'next.config.js'))
const slugPage = new File(join(appDir, 'app/another/[slug]/page.js'))
const apiJson = new File(join(appDir, 'app/api/json/route.js'))

export const expectedWhenTrailingSlashTrue = [
  '404.html',
  '404/index.html',
  '__next.__PAGE__.rsc.txt',
  '__next._full.rsc.txt',
  '__next._head.rsc.txt',
  '__next._index.rsc.txt',
  '__next._tree.rsc.txt',
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
  '_not-found/__next._full.rsc.txt',
  '_not-found/__next._head.rsc.txt',
  '_not-found/__next._index.rsc.txt',
  '_not-found/__next._not-found.__PAGE__.rsc.txt',
  '_not-found/__next._not-found.rsc.txt',
  '_not-found/__next._tree.rsc.txt',
  '_not-found/index.html',
  '_not-found/index.rsc.txt',
  'another/__next._full.rsc.txt',
  'another/__next._head.rsc.txt',
  'another/__next._index.rsc.txt',
  'another/__next._tree.rsc.txt',
  'another/__next.another.__PAGE__.rsc.txt',
  'another/__next.another.rsc.txt',
  'another/first/__next._full.rsc.txt',
  'another/first/__next._head.rsc.txt',
  'another/first/__next._index.rsc.txt',
  'another/first/__next._tree.rsc.txt',
  'another/first/__next.another.$d$slug.__PAGE__.rsc.txt',
  'another/first/__next.another.$d$slug.rsc.txt',
  'another/first/__next.another.rsc.txt',
  'another/first/index.html',
  'another/first/index.rsc.txt',
  'another/index.html',
  'another/index.rsc.txt',
  'another/second/__next._full.rsc.txt',
  'another/second/__next._head.rsc.txt',
  'another/second/__next._index.rsc.txt',
  'another/second/__next._tree.rsc.txt',
  'another/second/__next.another.$d$slug.__PAGE__.rsc.txt',
  'another/second/__next.another.$d$slug.rsc.txt',
  'another/second/__next.another.rsc.txt',
  'another/second/index.html',
  'another/second/index.rsc.txt',
  'api/json',
  'api/txt',
  'client/__next._full.rsc.txt',
  'client/__next._head.rsc.txt',
  'client/__next._index.rsc.txt',
  'client/__next._tree.rsc.txt',
  'client/__next.client.__PAGE__.rsc.txt',
  'client/__next.client.rsc.txt',
  'client/index.html',
  'client/index.rsc.txt',
  'favicon.ico',
  'image-import/__next._full.rsc.txt',
  'image-import/__next._head.rsc.txt',
  'image-import/__next._index.rsc.txt',
  'image-import/__next._tree.rsc.txt',
  'image-import/__next.image-import.__PAGE__.rsc.txt',
  'image-import/__next.image-import.rsc.txt',
  'image-import/index.html',
  'image-import/index.rsc.txt',
  'index.html',
  'index.rsc.txt',
  'robots.txt',
]

const expectedWhenTrailingSlashFalse = [
  '404.html',
  '__next.__PAGE__.rsc.txt',
  '__next._full.rsc.txt',
  '__next._head.rsc.txt',
  '__next._index.rsc.txt',
  '__next._tree.rsc.txt',
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
  '_not-found.rsc.txt',
  '_not-found/__next._full.rsc.txt',
  '_not-found/__next._head.rsc.txt',
  '_not-found/__next._index.rsc.txt',
  '_not-found/__next._not-found.__PAGE__.rsc.txt',
  '_not-found/__next._not-found.rsc.txt',
  '_not-found/__next._tree.rsc.txt',
  'another.html',
  'another.rsc.txt',
  'another/__next._full.rsc.txt',
  'another/__next._head.rsc.txt',
  'another/__next._index.rsc.txt',
  'another/__next._tree.rsc.txt',
  'another/__next.another.__PAGE__.rsc.txt',
  'another/__next.another.rsc.txt',
  'another/first.html',
  'another/first.rsc.txt',
  'another/first/__next._full.rsc.txt',
  'another/first/__next._head.rsc.txt',
  'another/first/__next._index.rsc.txt',
  'another/first/__next._tree.rsc.txt',
  'another/first/__next.another.$d$slug.__PAGE__.rsc.txt',
  'another/first/__next.another.$d$slug.rsc.txt',
  'another/first/__next.another.rsc.txt',
  'another/second.html',
  'another/second.rsc.txt',
  'another/second/__next._full.rsc.txt',
  'another/second/__next._head.rsc.txt',
  'another/second/__next._index.rsc.txt',
  'another/second/__next._tree.rsc.txt',
  'another/second/__next.another.$d$slug.__PAGE__.rsc.txt',
  'another/second/__next.another.$d$slug.rsc.txt',
  'another/second/__next.another.rsc.txt',
  'api/json',
  'api/txt',
  'client.html',
  'client.rsc.txt',
  'client/__next._full.rsc.txt',
  'client/__next._head.rsc.txt',
  'client/__next._index.rsc.txt',
  'client/__next._tree.rsc.txt',
  'client/__next.client.__PAGE__.rsc.txt',
  'client/__next.client.rsc.txt',
  'favicon.ico',
  'image-import.html',
  'image-import.rsc.txt',
  'image-import/__next._full.rsc.txt',
  'image-import/__next._head.rsc.txt',
  'image-import/__next._index.rsc.txt',
  'image-import/__next._tree.rsc.txt',
  'image-import/__next.image-import.__PAGE__.rsc.txt',
  'image-import/__next.image-import.rsc.txt',
  'index.html',
  'index.rsc.txt',
  'robots.txt',
]

export async function getFiles(cwd = exportDir) {
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
export async function runTests({
  isDev = false,
  trailingSlash = true,
  dynamicPage,
  dynamicParams,
  dynamicApiRoute,
  generateStaticParamsOpt,
  expectedErrMsg,
}: {
  isDev?: boolean
  trailingSlash?: boolean
  dynamicPage?: string
  dynamicParams?: string
  dynamicApiRoute?: string
  generateStaticParamsOpt?: 'set noop' | 'set client'
  expectedErrMsg?: string | RegExp
}) {
  if (trailingSlash !== undefined) {
    nextConfig.replace(
      'trailingSlash: true,',
      `trailingSlash: ${trailingSlash},`
    )
  }

  if (dynamicPage !== undefined) {
    slugPage.replace(
      `export const dynamic = 'force-static'`,
      dynamicPage === 'undefined' ? '' : `export const dynamic = ${dynamicPage}`
    )
  }

  if (dynamicApiRoute !== undefined) {
    apiJson.replace(
      `export const dynamic = 'force-static'`,
      `export const dynamic = ${dynamicApiRoute}`
    )
  }

  if (dynamicParams !== undefined) {
    slugPage.prepend(`export const dynamicParams = ${dynamicParams}\n`)
  }

  if (generateStaticParamsOpt === 'set noop') {
    slugPage.replace('export function generateStaticParams', 'function noop')
  } else if (generateStaticParamsOpt === 'set client') {
    slugPage.prepend('"use client"\n')
  }
  await fs.remove(distDir)
  await fs.remove(exportDir)
  const port = await findPort()
  let stopOrKill: () => Promise<void>
  let result = { code: 0, stdout: '', stderr: '' }
  if (isDev) {
    const app = await launchApp(appDir, port, {
      stdout: false,
      onStdout(msg: string) {
        result.stdout += msg || ''
      },
      stderr: false,
      onStderr(msg: string) {
        result.stderr += msg || ''
      },
    })
    stopOrKill = async () => await killApp(app)
  } else {
    result = await nextBuild(appDir, [], { stdout: true, stderr: true })
    const app = await startStaticServer(exportDir, null, port)
    stopOrKill = async () => await stopApp(app)
  }

  try {
    if (expectedErrMsg) {
      if (isDev) {
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
        await check(() => result.stderr, /error/i)
      }
      expect(result.stderr).toMatch(expectedErrMsg)
    } else {
      const a = (n: number) => `li:nth-child(${n}) a`
      const browser = await webdriver(port, '/')
      await check(() => browser.elementByCss('h1').text(), 'Home')
      expect(await browser.elementByCss(a(1)).text()).toBe(
        'another no trailingslash'
      )
      await browser.elementByCss(a(1)).click()

      await check(() => browser.elementByCss('h1').text(), 'Another')
      expect(await browser.elementByCss(a(1)).text()).toBe(
        'Visit the home page'
      )
      await browser.elementByCss(a(1)).click()

      await check(() => browser.elementByCss('h1').text(), 'Home')
      expect(await browser.elementByCss(a(2)).text()).toBe(
        'another has trailingslash'
      )
      await browser.elementByCss(a(2)).click()

      await check(() => browser.elementByCss('h1').text(), 'Another')
      expect(await browser.elementByCss(a(1)).text()).toBe(
        'Visit the home page'
      )
      await browser.elementByCss(a(1)).click()

      await check(() => browser.elementByCss('h1').text(), 'Home')
      expect(await browser.elementByCss(a(3)).text()).toBe('another first page')
      await browser.elementByCss(a(3)).click()
      await check(() => browser.elementByCss('h1').text(), 'first')
      expect(await browser.elementByCss(a(1)).text()).toBe('Visit another page')
      await browser.elementByCss(a(1)).click()

      await check(() => browser.elementByCss('h1').text(), 'Another')
      expect(await browser.elementByCss(a(4)).text()).toBe(
        'another second page'
      )
      await browser.elementByCss(a(4)).click()

      await check(() => browser.elementByCss('h1').text(), 'second')
      expect(await browser.elementByCss(a(1)).text()).toBe('Visit another page')
      await browser.elementByCss(a(1)).click()

      await check(() => browser.elementByCss('h1').text(), 'Another')
      expect(await browser.elementByCss(a(5)).text()).toBe('image import page')
      await browser.elementByCss(a(5)).click()

      await check(() => browser.elementByCss('h1').text(), 'Image Import')
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

      if (!isDev) {
        if (trailingSlash) {
          expect(await getFiles()).toEqual(expectedWhenTrailingSlashTrue)
        } else {
          expect(await getFiles()).toEqual(expectedWhenTrailingSlashFalse)
        }
        const html404 = await fs.readFile(join(exportDir, '404.html'), 'utf8')
        expect(html404).toContain('<h1>My custom not found page</h1>')
      }
    }
  } finally {
    await stopOrKill()
    nextConfig.restore()
    slugPage.restore()
    apiJson.restore()
  }
}
