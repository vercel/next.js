/* eslint-env jest */
/* global jasmine */
import fs from 'fs-extra'
import path from 'path'
import {
  nextBuild,
  nextStart,
  findPort,
  killApp,
  renderViaHTTP
} from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 3

const appDir = path.join(__dirname, '../')
let buildId
let appPort
let app

describe('Prerendering pages', () => {
  beforeAll(async () => {
    await nextBuild(appDir)
    appPort = await findPort()
    app = await nextStart(appDir, appPort)
    buildId = (
      (await fs.readFile(path.join(appDir, '.next/BUILD_ID'), 'utf8')) || ''
    ).trim()
  })
  afterAll(() => killApp(app))

  it('should render the correct files', async () => {
    let files = ['nested/hello', 'another', 'index']

    for (const file of files) {
      expect(
        await fs.exists(
          path.join(
            appDir,
            '.next/server/static',
            buildId,
            'pages',
            file + '.html'
          )
        )
      ).toBe(true)
    }

    files = ['nested/old-school', 'old-school']

    for (const file of files) {
      expect(
        await fs.exists(
          path.join(
            appDir,
            '.next/server/static',
            buildId,
            'pages',
            file + '.js'
          )
        )
      ).toBe(true)
    }
  })

  it('should have called getInitialProps during prerender', async () => {
    const hello = await renderViaHTTP(appPort, '/nested/hello')
    expect(hello).toMatch(/something/)

    const another = await renderViaHTTP(appPort, '/another')
    expect(another).toMatch(/John Deux/)
  })

  it('should call getInitialProps for SSR pages', async () => {
    const oldSchool1 = await renderViaHTTP(appPort, '/old-school')
    expect(oldSchool1).toMatch(/I.*?m just an old SSR page/)

    const oldSchool2 = await renderViaHTTP(appPort, '/nested/old-school')
    expect(oldSchool2).toMatch(/I.*?m just an old SSR page/)
  })

  it('should autoExport correctly', async () => {
    const index = await renderViaHTTP(appPort, '/')
    expect(index).toMatch(/An autoExported page/)
  })
})
