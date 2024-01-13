/* eslint-env jest */
import fs from 'fs-extra'
import { join } from 'path'
import cheerio from 'cheerio'
import webdriver from 'next-webdriver'
import {
  nextBuild,
  nextStart,
  findPort,
  killApp,
  fetchViaHTTP,
  waitFor,
  check,
} from 'next-test-utils'

const appDir = join(__dirname, '..')
const dataFile = join(appDir, 'data.txt')

let app
let appPort

const runTests = () => {
  it('should revalidate page when notFund returned during build', async () => {
    let res = await fetchViaHTTP(appPort, '/initial-not-found/first')
    let $ = cheerio.load(await res.text())
    expect(res.status).toBe(404)
    expect($('#not-found').text()).toBe('404 page')

    res = await fetchViaHTTP(appPort, '/initial-not-found/second')
    $ = cheerio.load(await res.text())
    expect(res.status).toBe(404)
    expect($('#not-found').text()).toBe('404 page')

    res = await fetchViaHTTP(appPort, '/initial-not-found')
    $ = cheerio.load(await res.text())
    expect(res.status).toBe(404)
    expect($('#not-found').text()).toBe('404 page')

    await fs.writeFile(dataFile, '200')

    // wait for revalidation period
    await waitFor(1500)
    await fetchViaHTTP(appPort, '/initial-not-found/first')
    await fetchViaHTTP(appPort, '/initial-not-found/second')
    await fetchViaHTTP(appPort, '/initial-not-found')

    // wait for revalidation to occur in background
    try {
      await check(async () => {
        res = await fetchViaHTTP(appPort, '/initial-not-found/first')
        $ = cheerio.load(await res.text())

        return res.status === 200 && $('#data').text() === '200'
          ? 'success'
          : `${res.status} - ${$('#data').text()}`
      }, 'success')

      await check(async () => {
        res = await fetchViaHTTP(appPort, '/initial-not-found/second')
        $ = cheerio.load(await res.text())

        return res.status === 200 && $('#data').text() === '200'
          ? 'success'
          : `${res.status} - ${$('#data').text()}`
      }, 'success')

      await check(async () => {
        res = await fetchViaHTTP(appPort, '/initial-not-found')
        $ = cheerio.load(await res.text())

        return res.status === 200 && $('#data').text() === '200'
          ? 'success'
          : `${res.status} - ${$('#data').text()}`
      }, 'success')
    } finally {
      await fs.writeFile(dataFile, '404')
    }
  })

  it('should revalidate after notFound is returned for fallback: blocking', async () => {
    let res = await fetchViaHTTP(appPort, '/fallback-blocking/hello')
    let $ = cheerio.load(await res.text())

    const privateCache =
      'private, no-cache, no-store, max-age=0, must-revalidate'
    expect(res.headers.get('cache-control')).toBe(privateCache)
    expect(res.status).toBe(404)
    expect(JSON.parse($('#props').text()).notFound).toBe(true)

    await waitFor(1000)
    res = await fetchViaHTTP(appPort, '/fallback-blocking/hello')
    $ = cheerio.load(await res.text())

    expect(res.headers.get('cache-control')).toBe(privateCache)
    expect(res.status).toBe(404)
    expect(JSON.parse($('#props').text()).notFound).toBe(true)

    await waitFor(1000)
    res = await fetchViaHTTP(appPort, '/fallback-blocking/hello')
    $ = cheerio.load(await res.text())

    const props = JSON.parse($('#props').text())
    expect(res.headers.get('cache-control')).toBe(
      's-maxage=1, stale-while-revalidate'
    )
    expect(res.status).toBe(200)
    expect(props.found).toBe(true)
    expect(props.params).toEqual({ slug: 'hello' })
    expect(isNaN(props.random)).toBe(false)

    await waitFor(1000)
    res = await fetchViaHTTP(appPort, '/fallback-blocking/hello')
    $ = cheerio.load(await res.text())

    const props2 = JSON.parse($('#props').text())
    expect(res.headers.get('cache-control')).toBe(
      's-maxage=1, stale-while-revalidate'
    )
    expect(res.status).toBe(200)
    expect(props2.found).toBe(true)
    expect(props2.params).toEqual({ slug: 'hello' })
    expect(isNaN(props2.random)).toBe(false)

    await waitFor(1000)
    res = await fetchViaHTTP(appPort, '/fallback-blocking/hello')
    $ = cheerio.load(await res.text())

    const props3 = JSON.parse($('#props').text())
    expect(res.headers.get('cache-control')).toBe(
      's-maxage=1, stale-while-revalidate'
    )
    expect(res.status).toBe(200)
    expect(props3.found).toBe(true)
    expect(props3.params).toEqual({ slug: 'hello' })
    expect(isNaN(props3.random)).toBe(false)
    expect(props3.random).not.toBe(props.random)
  })

  it('should revalidate after notFound is returned for fallback: true', async () => {
    const browser = await webdriver(appPort, '/fallback-true/world')

    await browser.waitForElementByCss('#not-found')

    await waitFor(1000)
    let res = await fetchViaHTTP(appPort, '/fallback-true/world')
    let $ = cheerio.load(await res.text())

    expect(res.headers.get('cache-control')).toBe(
      'private, no-cache, no-store, max-age=0, must-revalidate'
    )
    expect(res.status).toBe(404)
    expect(JSON.parse($('#props').text()).notFound).toBe(true)

    await waitFor(1000)
    res = await fetchViaHTTP(appPort, '/fallback-true/world')
    $ = cheerio.load(await res.text())

    const props = JSON.parse($('#props').text())
    expect(res.headers.get('cache-control')).toBe(
      's-maxage=1, stale-while-revalidate'
    )
    expect(res.status).toBe(200)
    expect(props.found).toBe(true)
    expect(props.params).toEqual({ slug: 'world' })
    expect(isNaN(props.random)).toBe(false)

    await waitFor(1000)
    res = await fetchViaHTTP(appPort, '/fallback-true/world')
    $ = cheerio.load(await res.text())

    const props2 = JSON.parse($('#props').text())
    expect(res.headers.get('cache-control')).toBe(
      's-maxage=1, stale-while-revalidate'
    )
    expect(res.status).toBe(200)
    expect(props2.found).toBe(true)
    expect(props2.params).toEqual({ slug: 'world' })
    expect(isNaN(props2.random)).toBe(false)

    await waitFor(1000)
    res = await fetchViaHTTP(appPort, '/fallback-true/world')
    $ = cheerio.load(await res.text())

    const props3 = JSON.parse($('#props').text())
    expect(res.headers.get('cache-control')).toBe(
      's-maxage=1, stale-while-revalidate'
    )
    expect(res.status).toBe(200)
    expect(props3.found).toBe(true)
    expect(props3.params).toEqual({ slug: 'world' })
    expect(isNaN(props3.random)).toBe(false)
    expect(props3.random).not.toBe(props.random)
  })
}

describe('SSG notFound revalidate', () => {
  ;(process.env.TURBOPACK ? describe.skip : describe)('production mode', () => {
    beforeAll(async () => {
      await fs.remove(join(appDir, '.next'))
      await nextBuild(appDir, undefined, {
        cwd: appDir,
      })
      appPort = await findPort()
      app = await nextStart(appDir, appPort, {
        cwd: appDir,
      })
    })
    afterAll(() => killApp(app))

    runTests()
  })
})
