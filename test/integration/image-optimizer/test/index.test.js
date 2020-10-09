/* eslint-env jest */
import fs from 'fs-extra'
import { join } from 'path'
import {
  killApp,
  findPort,
  launchApp,
  fetchViaHTTP,
  nextBuild,
  nextStart,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '../')
const nextConfig = join(appDir, 'next.config.js')
let appPort
let app

function runTests() {
  it('should return home page', async () => {
    const res = await fetchViaHTTP(appPort, '/', null, {})
    expect(await res.text()).toMatch(/Image Optimizer Home/m)
  })

  it('should fail when url is missing', async () => {
    const query = { w: 64, q: 100 }
    const res = await fetchViaHTTP(appPort, '/_next/image', query, {})
    expect(res.status).toBe(400)
    expect(await res.text()).toBe('url is missing')
  })

  it('should fail when w is missing', async () => {
    const query = { url: '/vercel-logo.png', q: 100 }
    const res = await fetchViaHTTP(appPort, '/_next/image', query, {})
    expect(res.status).toBe(400)
    expect(await res.text()).toBe('w is missing')
  })

  it('should fail when q is missing', async () => {
    const query = { url: '/vercel-logo.png', w: 64 }
    const res = await fetchViaHTTP(appPort, '/_next/image', query, {})
    expect(res.status).toBe(400)
    expect(await res.text()).toBe('q is missing')
  })

  it('should fail when q is greater than 100', async () => {
    const query = { url: '/vercel-logo.png', w: 64, q: 101 }
    const res = await fetchViaHTTP(appPort, '/_next/image', query, {})
    expect(res.status).toBe(400)
    expect(await res.text()).toBe('q must be between 1 and 100')
  })

  it('should fail when q is less than 1', async () => {
    const query = { url: '/vercel-logo.png', w: 64, q: 0 }
    const res = await fetchViaHTTP(appPort, '/_next/image', query, {})
    expect(res.status).toBe(400)
    expect(await res.text()).toBe('q must be between 1 and 100')
  })

  it('should fail when w is not a number', async () => {
    const query = { url: '/vercel-logo.png', w: 'foo', q: 100 }
    const res = await fetchViaHTTP(appPort, '/_next/image', query, {})
    expect(res.status).toBe(400)
    expect(await res.text()).toBe('w must be a number')
  })

  it('should fail when q is not a number', async () => {
    const query = { url: '/vercel-logo.png', w: 64, q: 'foo' }
    const res = await fetchViaHTTP(appPort, '/_next/image', query, {})
    expect(res.status).toBe(400)
    expect(await res.text()).toBe('q must be a number')
  })

  it('should resize relative url', async () => {
    const query = { url: '/vercel-logo.png', w: 64, q: 100 }
    const res = await fetchViaHTTP(appPort, '/_next/image', query, {})
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/webp')
  })

  it('should resize absolute url from localhost', async () => {
    const query = {
      url: `http://localhost:${appPort}/vercel-logo.png`,
      w: 64,
      q: 100,
    }
    const res = await fetchViaHTTP(appPort, '/_next/image', query, {})
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/webp')
  })
}

describe('API routes', () => {
  describe('dev support', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()
  })

  describe('Server support', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()
  })

  describe('Serverless support', () => {
    beforeAll(async () => {
      await fs.writeFile(
        nextConfig,
        `module.exports = { target: 'serverless' }`
      )
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(async () => {
      await killApp(app)
      await fs.remove(nextConfig)
    })

    runTests()
  })
})
