/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import {
  killApp,
  findPort,
  launchApp,
  nextStart,
  nextBuild,
  renderViaHTTP,
  fetchViaHTTP,
  waitFor,
  getPageFileFromPagesManifest,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '../')
const pages404 = join(appDir, 'pages/404.js')
const nextConfig = join(appDir, 'next.config.js')
const gip404Err = /`pages\/404` can not have getInitialProps\/getServerSideProps/

let nextConfigContent
let appPort
let app

const runTests = (mode = 'server') => {
  it('should use pages/404', async () => {
    const html = await renderViaHTTP(appPort, '/abc')
    expect(html).toContain('custom 404 page')
  })

  it('should set correct status code with pages/404', async () => {
    const res = await fetchViaHTTP(appPort, '/abc')
    expect(res.status).toBe(404)
  })

  it('should not error when visited directly', async () => {
    const res = await fetchViaHTTP(appPort, '/404')
    expect(res.status).toBe(404)
    expect(await res.text()).toContain('custom 404 page')
  })

  it('should render _error for a 500 error still', async () => {
    const html = await renderViaHTTP(appPort, '/err')
    expect(html).not.toContain('custom 404 page')
    expect(html).toContain(mode === 'dev' ? 'oops' : 'Internal Server Error')
  })

  if (mode !== 'dev') {
    it('should output 404.html during build', async () => {
      const page = getPageFileFromPagesManifest(appDir, '/404')
      expect(page.endsWith('.html')).toBe(true)
    })

    it('should add /404 to pages-manifest correctly', async () => {
      const manifest = await fs.readJSON(
        join(appDir, '.next', mode, 'pages-manifest.json')
      )
      expect('/404' in manifest).toBe(true)
    })
  }
}

describe('404 Page Support', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests('dev')
  })

  describe('server mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests('server')
  })

  describe('serverless mode', () => {
    beforeAll(async () => {
      nextConfigContent = await fs.readFile(nextConfig, 'utf8')
      await fs.writeFile(
        nextConfig,
        `
        module.exports = {
          target: 'serverless'
        }
      `
      )
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(async () => {
      await fs.writeFile(nextConfig, nextConfigContent)
      await killApp(app)
    })

    runTests('serverless')
  })

  it('falls back to _error correctly without pages/404', async () => {
    await fs.move(pages404, `${pages404}.bak`)
    appPort = await findPort()
    app = await launchApp(appDir, appPort)
    const res = await fetchViaHTTP(appPort, '/abc')

    await fs.move(`${pages404}.bak`, pages404)
    await killApp(app)

    expect(res.status).toBe(404)
    expect(await res.text()).toContain('This page could not be found')
  })

  it('shows error with getInitialProps in pages/404 build', async () => {
    await fs.move(pages404, `${pages404}.bak`)
    await fs.writeFile(
      pages404,
      `
      const page = () => 'custom 404 page'
      page.getInitialProps = () => ({ a: 'b' })
      export default page
    `
    )
    const { stderr, code } = await nextBuild(appDir, [], { stderr: true })
    await fs.remove(pages404)
    await fs.move(`${pages404}.bak`, pages404)

    expect(stderr).toMatch(gip404Err)
    expect(code).toBe(1)
  })

  it('shows error with getInitialProps in pages/404 dev', async () => {
    await fs.move(pages404, `${pages404}.bak`)
    await fs.writeFile(
      pages404,
      `
      const page = () => 'custom 404 page'
      page.getInitialProps = () => ({ a: 'b' })
      export default page
    `
    )

    let stderr = ''
    appPort = await findPort()
    app = await launchApp(appDir, appPort, {
      onStderr(msg) {
        stderr += msg || ''
      },
    })
    await renderViaHTTP(appPort, '/abc')
    await waitFor(1000)

    await killApp(app)

    await fs.remove(pages404)
    await fs.move(`${pages404}.bak`, pages404)

    expect(stderr).toMatch(gip404Err)
  })

  it('does not show error with getStaticProps in pages/404 build', async () => {
    await fs.move(pages404, `${pages404}.bak`)
    await fs.writeFile(
      pages404,
      `
      const page = () => 'custom 404 page'
      export const getStaticProps = () => ({ props: { a: 'b' } })
      export default page
    `
    )
    const { stderr, code } = await nextBuild(appDir, [], { stderr: true })
    await fs.remove(pages404)
    await fs.move(`${pages404}.bak`, pages404)

    expect(stderr).not.toMatch(gip404Err)
    expect(code).toBe(0)
  })

  it('does not show error with getStaticProps in pages/404 dev', async () => {
    await fs.move(pages404, `${pages404}.bak`)
    await fs.writeFile(
      pages404,
      `
      const page = () => 'custom 404 page'
      export const getStaticProps = () => ({ props: { a: 'b' } })
      export default page
    `
    )

    let stderr = ''
    appPort = await findPort()
    app = await launchApp(appDir, appPort, {
      onStderr(msg) {
        stderr += msg || ''
      },
    })
    await renderViaHTTP(appPort, '/abc')
    await waitFor(1000)

    await killApp(app)

    await fs.remove(pages404)
    await fs.move(`${pages404}.bak`, pages404)

    expect(stderr).not.toMatch(gip404Err)
  })

  it('shows error with getServerSideProps in pages/404 build', async () => {
    await fs.move(pages404, `${pages404}.bak`)
    await fs.writeFile(
      pages404,
      `
      const page = () => 'custom 404 page'
      export const getServerSideProps = () => ({ props: { a: 'b' } })
      export default page
    `
    )
    const { stderr, code } = await nextBuild(appDir, [], { stderr: true })
    await fs.remove(pages404)
    await fs.move(`${pages404}.bak`, pages404)

    expect(stderr).toMatch(gip404Err)
    expect(code).toBe(1)
  })

  it('shows error with getServerSideProps in pages/404 dev', async () => {
    await fs.move(pages404, `${pages404}.bak`)
    await fs.writeFile(
      pages404,
      `
      const page = () => 'custom 404 page'
      export const getServerSideProps = () => ({ props: { a: 'b' } })
      export default page
    `
    )

    let stderr = ''
    appPort = await findPort()
    app = await launchApp(appDir, appPort, {
      onStderr(msg) {
        stderr += msg || ''
      },
    })
    await renderViaHTTP(appPort, '/abc')
    await waitFor(1000)

    await killApp(app)

    await fs.remove(pages404)
    await fs.move(`${pages404}.bak`, pages404)

    expect(stderr).toMatch(gip404Err)
  })
})
