/* eslint-env jest */

import { join } from 'path'
import {
  killApp,
  findPort,
  nextStart,
  nextBuild,
  renderViaHTTP,
  initNextServerScript,
} from 'next-test-utils'
import fs from 'fs-extra'

jest.setTimeout(1000 * 60 * 2)

const fixturesDir = join(__dirname, '..', 'fixtures')

const fsExists = (file) =>
  fs
    .access(file)
    .then(() => true)
    .catch(() => false)

async function getBuildId(appDir) {
  return fs.readFile(join(appDir, '.next', 'BUILD_ID'), 'utf8')
}

const startServerlessEmulator = async (dir, port) => {
  const scriptPath = join(dir, 'server.js')
  const env = Object.assign(
    {},
    { ...process.env },
    { PORT: port, BUILD_ID: await getBuildId(dir) }
  )
  return initNextServerScript(scriptPath, /ready on/i, env)
}

describe('Font Optimization', () => {
  describe.each([
    [
      'google',
      [
        'https://fonts.googleapis.com/css?family=Voces',
        'https://fonts.googleapis.com/css2?family=Modak',
        'https://fonts.googleapis.com/css2?family=Roboto:wght@700',
      ],
      [
        /<style data-href="https:\/\/fonts\.googleapis\.com\/css\?family=Voces">.*<\/style>/,
        /<style data-href="https:\/\/fonts\.googleapis\.com\/css2\?family=Modak">.*<\/style>/,
        /<style data-href="https:\/\/fonts\.googleapis\.com\/css2\?family=Roboto:wght@700">.*<\/style>/,
      ],
    ],
    [
      'typekit',
      [
        'https://use.typekit.net/plm1izr.css',
        'https://use.typekit.net/erd0sed.css',
        'https://use.typekit.net/ucs7mcf.css',
      ],
      [
        /<style data-href="https:\/\/use.typekit.net\/plm1izr.css">.*<\/style>/,
        /<style data-href="https:\/\/use.typekit.net\/erd0sed.css">.*<\/style>/,
        /<style data-href="https:\/\/use.typekit.net\/ucs7mcf.css">.*<\/style>/,
      ],
    ],
  ])(
    'with-%s',
    (
      property,
      [staticFont, staticHeadFont, starsFont],
      [staticPattern, staticHeadPattern, starsPattern]
    ) => {
      const appDir = join(fixturesDir, `with-${property}`)
      const nextConfig = join(appDir, 'next.config.js')
      let builtServerPagesDir
      let builtPage
      let appPort
      let app

      function runTests() {
        it(`should inline the ${property} fonts for static pages`, async () => {
          const html = await renderViaHTTP(appPort, '/index')
          expect(await fsExists(builtPage('font-manifest.json'))).toBe(true)
          expect(html).toContain(
            `<link rel="stylesheet" data-href="${staticFont}"/>`
          )
          expect(html).toMatch(staticPattern)
        })

        it(`should inline the ${property} fonts for static pages with Next/Head`, async () => {
          const html = await renderViaHTTP(appPort, '/static-head')
          expect(await fsExists(builtPage('font-manifest.json'))).toBe(true)
          expect(html).toContain(
            `<link rel="stylesheet" data-href="${staticHeadFont}"/>`
          )
          expect(html).toMatch(staticHeadPattern)
        })

        it(`should inline the ${property} fonts for SSR pages`, async () => {
          const html = await renderViaHTTP(appPort, '/stars')
          expect(await fsExists(builtPage('font-manifest.json'))).toBe(true)
          expect(html).toContain(
            `<link rel="stylesheet" data-href="${starsFont}"/>`
          )
          expect(html).toMatch(starsPattern)
        })

        it('should skip this optimization for AMP pages', async () => {
          const html = await renderViaHTTP(appPort, '/amp')
          expect(await fsExists(builtPage('font-manifest.json'))).toBe(true)
          expect(html).toContain(`<link rel="stylesheet" href="${staticFont}">`)
          expect(html).not.toMatch(staticPattern)
        })

        it('should minify the css', async () => {
          const snapshotJson = JSON.parse(
            await fs.readFile(join(appDir, 'manifest-snapshot.json'), {
              encoding: 'utf-8',
            })
          )
          const testJson = JSON.parse(
            await fs.readFile(builtPage('font-manifest.json'), {
              encoding: 'utf-8',
            })
          )
          const testCss = {}
          testJson.forEach((fontDefinition) => {
            testCss[fontDefinition.url] = fontDefinition.content
          })
          const snapshotCss = {}
          snapshotJson.forEach((fontDefinition) => {
            snapshotCss[fontDefinition.url] = fontDefinition.content
          })

          expect(testCss).toStrictEqual(snapshotCss)
        })
      }

      describe('Font optimization for SSR apps', () => {
        beforeAll(async () => {
          await fs.writeFile(
            nextConfig,
            `module.exports = { experimental: {optimizeFonts: true} }`,
            'utf8'
          )

          if (fs.pathExistsSync(join(appDir, '.next'))) {
            await fs.remove(join(appDir, '.next'))
          }
          await nextBuild(appDir)
          appPort = await findPort()
          app = await nextStart(appDir, appPort)
          builtServerPagesDir = join(appDir, '.next', 'server')
          builtPage = (file) => join(builtServerPagesDir, file)
        })
        afterAll(() => killApp(app))
        runTests()
      })

      describe('Font optimization for serverless apps', () => {
        beforeAll(async () => {
          await fs.writeFile(
            nextConfig,
            `module.exports = { target: 'serverless', experimental: {optimizeFonts: true} }`,
            'utf8'
          )
          await nextBuild(appDir)
          appPort = await findPort()
          app = await nextStart(appDir, appPort)
          builtServerPagesDir = join(appDir, '.next', 'serverless')
          builtPage = (file) => join(builtServerPagesDir, file)
        })
        afterAll(() => killApp(app))
        runTests()
      })

      describe('Font optimization for emulated serverless apps', () => {
        beforeAll(async () => {
          await fs.writeFile(
            nextConfig,
            `module.exports = { target: 'experimental-serverless-trace', experimental: {optimizeFonts: true} }`,
            'utf8'
          )
          await nextBuild(appDir)
          appPort = await findPort()
          await startServerlessEmulator(appDir, appPort)
          builtServerPagesDir = join(appDir, '.next', 'serverless')
          builtPage = (file) => join(builtServerPagesDir, file)
        })
        afterAll(async () => {
          await fs.remove(nextConfig)
        })
        runTests()
      })
    }
  )
})
