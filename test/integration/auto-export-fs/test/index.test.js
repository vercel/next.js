/* eslint-env jest */
/* global jasmine */
import path from 'path'
import fs from 'fs-extra'
import {
  nextBuild,
  nextStart,
  findPort,
  renderViaHTTP,
  killApp
} from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5
const appDir = path.join(__dirname, '..')
let appPort
let app

const pages = ['/another.js', '/abc.js', '/123/hello.js']
const origContents = []

describe('Auto Export Flying Shuttle', () => {
  beforeAll(async () => {
    await fs.remove(path.join(appDir, '.next'))

    for (const page of pages) {
      origContents.push(
        await fs.readFile(path.join(appDir, 'pages', page), 'utf8')
      )
    }
  })
  afterAll(async () => {
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i]
      const content = origContents[i]
      await fs.writeFile(path.join(appDir, 'pages', page), content, 'utf8')
    }
  })

  it('does an initial build', async () => {
    await nextBuild(appDir)
    appPort = await findPort()
    app = await nextStart(appDir, appPort)

    const checks = [
      ['/another', /hello another/],
      ['/abc', /hello abc/],
      ['/123/hello', /hello 123/]
    ]

    for (const check of checks) {
      const html = await renderViaHTTP(appPort, check[0])
      expect(html).toMatch(check[1])
    }
    await killApp(app)
  })

  it('rebuilds one page', async () => {
    const curPage = path.join(appDir, 'pages/123/hello.js')
    const origContent = await fs.readFile(curPage, 'utf8')
    await fs.writeFile(curPage, origContent.replace('123', '321'))

    await nextBuild(appDir)
    appPort = await findPort()
    app = await nextStart(appDir, appPort)

    const checks = [
      ['/another', /hello another/],
      ['/abc', /hello abc/],
      ['/123/hello', /hello 321/]
    ]

    for (const check of checks) {
      const html = await renderViaHTTP(appPort, check[0])
      expect(html).toMatch(check[1])
    }

    await killApp(app)
  })

  it('rebuilds multiple pages', async () => {
    const abcPath = path.join(appDir, 'pages/abc.js')
    const anotherPath = path.join(appDir, 'pages/another.js')

    const abcContent = await fs.readFile(abcPath, 'utf8')
    await fs.writeFile(abcPath, abcContent.replace('abc', 'cba'), 'utf8')

    const anotherContent = await fs.readFile(anotherPath, 'utf8')
    await fs.writeFile(
      anotherPath,
      anotherContent.replace('another', 'nothing'),
      'utf8'
    )

    await nextBuild(appDir)
    appPort = await findPort()
    app = await nextStart(appDir, appPort)

    const checks = [
      ['/another', /hello nothing/],
      ['/abc', /hello cba/],
      ['/123/hello', /hello 321/]
    ]

    for (const check of checks) {
      const html = await renderViaHTTP(appPort, check[0])
      expect(html).toMatch(check[1])
    }
    await killApp(app)
  })
})
