/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import cheerio from 'cheerio'
import { validateAMP } from 'amp-test-utils'
import {
  nextBuild,
  renderViaHTTP,
  File,
  findPort,
  launchApp,
  killApp,
  nextStart,
} from 'next-test-utils'

const appDir = join(__dirname, '../')
const nextConfig = new File(join(appDir, 'next.config.js'))
let builtServerPagesDir
let appPort
let app

const fsExists = (file) =>
  fs
    .access(file)
    .then(() => true)
    .catch(() => false)

const runTests = (isDev = false) => {
  it('should load an amp first page correctly', async () => {
    const html = await renderViaHTTP(appPort, '/amp')

    if (!isDev) {
      await validateAMP(html)
    }
    const $ = cheerio.load(html)
    expect($('#use-amp').text()).toContain('yes')
  })

  it('should load a hybrid amp page without query correctly', async () => {
    const html = await renderViaHTTP(appPort, '/hybrid')
    const $ = cheerio.load(html)
    expect($('#use-amp').text()).toContain('no')
    expect($('#hello').text()).toContain('hello')
  })

  it('should load dynamic hybrid SSG/AMP page', async () => {
    const html = await renderViaHTTP(appPort, '/blog/post-1')
    const $ = cheerio.load(html)
    expect($('#use-amp').text()).toContain('no')
    expect($('#hello').text()).toContain('hello')
    expect($('#slug').text()).toContain('post-1')
  })

  it('should load dynamic hybrid SSG/AMP page with trailing slash', async () => {
    const html = await renderViaHTTP(appPort, '/blog/post-1/')
    const $ = cheerio.load(html)
    expect($('#use-amp').text()).toContain('no')
    expect($('#hello').text()).toContain('hello')
    expect($('#slug').text()).toContain('post-1')
  })

  it('should load dynamic hybrid SSG/AMP page with query', async () => {
    const html = await renderViaHTTP(appPort, '/blog/post-1?amp=1')
    const $ = cheerio.load(html)
    expect($('#use-amp').text()).toContain('yes')
    expect($('#hello').text()).toContain('hello')
    expect($('#slug').text()).toContain('post-1')
  })

  it('should load a hybrid amp page with query correctly', async () => {
    const html = await renderViaHTTP(appPort, '/hybrid?amp=1')

    if (!isDev) {
      await validateAMP(html)
    }
    const $ = cheerio.load(html)
    expect($('#use-amp').text()).toContain('yes')
    expect($('#hello').text()).toContain('hello')
  })

  if (!isDev) {
    const builtPage = (file) => join(builtServerPagesDir, file)

    it('should output prerendered files correctly during build', async () => {
      expect(await fsExists(builtPage('amp.js'))).toBe(true)
      expect(await fsExists(builtPage('amp.html'))).toBe(true)
      expect(await fsExists(builtPage('amp.json'))).toBe(true)

      expect(await fsExists(builtPage('hybrid.js'))).toBe(true)
      expect(await fsExists(builtPage('hybrid.html'))).toBe(true)
      expect(await fsExists(builtPage('hybrid.json'))).toBe(true)

      expect(await fsExists(builtPage('hybrid.amp.js'))).toBe(false)
      expect(await fsExists(builtPage('hybrid.amp.html'))).toBe(true)
      expect(await fsExists(builtPage('hybrid.amp.json'))).toBe(true)
    })
  }
}

describe('AMP SSG Support', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
      // TODO: use browser instead to do checks that now need filesystem access
      builtServerPagesDir = join(appDir, '.next', 'server', 'pages')
    })
    afterAll(() => killApp(app))
    runTests()
  })
  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))
    runTests(true)
  })
  describe('export mode', () => {
    ;(process.env.TURBOPACK ? describe.skip : describe)(
      'production mode',
      () => {
        let buildId

        beforeAll(async () => {
          nextConfig.write(`module.exports = { output: 'export' }`)
          await nextBuild(appDir)
          buildId = await fs.readFile(join(appDir, '.next/BUILD_ID'), 'utf8')
        })

        afterAll(() => nextConfig.delete())

        it('should have copied SSG files correctly', async () => {
          const outFile = (file) => join(appDir, 'out', file)

          expect(await fsExists(outFile('amp.html'))).toBe(true)
          expect(await fsExists(outFile('index.html'))).toBe(true)
          expect(await fsExists(outFile('hybrid.html'))).toBe(true)
          expect(await fsExists(outFile('amp.amp.html'))).toBe(false)
          expect(await fsExists(outFile('hybrid.amp.html'))).toBe(true)
          expect(await fsExists(outFile('blog/post-1.html'))).toBe(true)
          expect(await fsExists(outFile('blog/post-1.amp.html'))).toBe(true)

          expect(
            await fsExists(outFile(join('_next/data', buildId, 'amp.json')))
          ).toBe(true)

          expect(
            await fsExists(outFile(join('_next/data', buildId, 'hybrid.json')))
          ).toBe(true)
        })
      }
    )
  })
})
