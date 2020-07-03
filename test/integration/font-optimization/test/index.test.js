/* eslint-env jest */

import { join } from 'path'
import {
  killApp,
  findPort,
  nextStart,
  nextBuild,
  renderViaHTTP,
} from 'next-test-utils'
import fs from 'fs-extra'

jest.setTimeout(1000 * 30)

const appDir = join(__dirname, '../server')
let builtServerPagesDir
let builtPage
let appPort
let app

const fsExists = (file) =>
  fs
    .access(file)
    .then(() => true)
    .catch(() => false)

describe('Font optimization', () => {
  beforeAll(async () => {
    await nextBuild(appDir)
    appPort = await findPort()
    app = await nextStart(appDir, appPort)
    builtServerPagesDir = join(appDir, '.next/server')
    builtPage = (file) => join(builtServerPagesDir, file)
  })
  afterAll(() => killApp(app))

  it('should inline the google fonts for static pages', async () => {
    const html = await renderViaHTTP(appPort, '/')
    expect(await fsExists(builtPage('font-manifest.json'))).toBe(true)
    expect(html).toContain(
      '<link rel="stylesheet" data-href="https://fonts.googleapis.com/css?family=Voces"/>'
    )
    expect(html).toMatch(
      /<style data-href="https:\/\/fonts\.googleapis\.com\/css\?family=Voces">.*<\/style>/
    )
  })

  it('should inline the google fonts for SSR pages', async () => {
    const html = await renderViaHTTP(appPort, '/stars')
    expect(await fsExists(builtPage('font-manifest.json'))).toBe(true)
    expect(html).toContain(
      '<link rel="stylesheet" data-href="https://fonts.googleapis.com/css2?family=Roboto:wght@700"/>'
    )
    expect(html).toMatch(
      /<style data-href="https:\/\/fonts\.googleapis\.com\/css2\?family=Roboto:wght@700">.*<\/style>/
    )
  })
})
