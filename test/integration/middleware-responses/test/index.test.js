/* eslint-env jest */

import { join } from 'path'
import cheerio from 'cheerio'
import {
  fetchViaHTTP,
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)
const context = { appDir: join(__dirname, '../') }

describe('Middleware Responses', () => {
  describe('dev mode', () => {
    afterAll(() => killApp(context.app))
    beforeAll(async () => {
      context.appPort = await findPort()
      context.app = await launchApp(context.appDir, context.appPort)
    })

    testsWithLocale(context)
    testsWithLocale(context, '/fr')
  })

  describe('production mode', () => {
    afterAll(() => killApp(context.app))
    beforeAll(async () => {
      await nextBuild(context.appDir)
      context.appPort = await findPort()
      context.app = await nextStart(context.appDir, context.appPort)
    })

    testsWithLocale(context)
    testsWithLocale(context, '/fr')
  })
})

function testsWithLocale(context, locale = '') {
  const label = locale ? `${locale} ` : ``

  it(`${label}responds with multiple cookies`, async () => {
    const res = await fetchViaHTTP(context.appPort, `${locale}/two-cookies`)
    expect(res.headers.raw()['set-cookie']).toEqual([
      'foo=chocochip',
      'bar=chocochip',
    ])
  })

  it(`${label}should stream a response`, async () => {
    const res = await fetchViaHTTP(
      context.appPort,
      `${locale}/stream-a-response`
    )
    const html = await res.text()
    expect(html).toBe('this is a streamed response with some text')
  })

  it(`${label}should respond with a body`, async () => {
    const res = await fetchViaHTTP(context.appPort, `${locale}/send-response`)
    const html = await res.text()
    expect(html).toBe('{"message":"hi!"}')
  })

  it(`${label}should respond with a 401 status code`, async () => {
    const res = await fetchViaHTTP(context.appPort, `${locale}/bad-status`)
    const html = await res.text()
    expect(res.status).toBe(401)
    expect(html).toBe('Auth required')
  })

  it(`${label}should render a React component`, async () => {
    const res = await fetchViaHTTP(context.appPort, `${locale}/react?name=jack`)
    const html = await res.text()
    expect(html).toBe('<h1>SSR with React! Hello, jack</h1>')
  })

  it(`${label}should stream a React component`, async () => {
    const res = await fetchViaHTTP(context.appPort, `${locale}/react-stream`)
    const html = await res.text()
    expect(html).toBe('<h1>I am a stream</h1><p>I am another stream</p>')
  })

  it(`${label}should stream a long response`, async () => {
    const res = await fetchViaHTTP(context.appPort, '/stream-long')
    const html = await res.text()
    expect(html).toBe(
      'this is a streamed this is a streamed this is a streamed this is a streamed this is a streamed this is a streamed this is a streamed this is a streamed this is a streamed this is a streamed after 2 seconds after 2 seconds after 2 seconds after 2 seconds after 2 seconds after 2 seconds after 2 seconds after 2 seconds after 2 seconds after 2 seconds after 4 seconds after 4 seconds after 4 seconds after 4 seconds after 4 seconds after 4 seconds after 4 seconds after 4 seconds after 4 seconds after 4 seconds '
    )
  })

  it(`${label}should render the right content via SSR`, async () => {
    const res = await fetchViaHTTP(context.appPort, '/')
    const html = await res.text()
    const $ = cheerio.load(html)
    expect($('.title').text()).toBe('Hello World')
  })

  it(`${label}should respond with one header`, async () => {
    const res = await fetchViaHTTP(context.appPort, `${locale}/header`)
    expect(res.headers.get('x-first-header')).toBe('valid')
  })

  it(`${label}should respond with two headers`, async () => {
    const res = await fetchViaHTTP(
      context.appPort,
      `${locale}/header?nested-header=true`
    )
    expect(res.headers.get('x-first-header')).toBe('valid')
    expect(res.headers.get('x-nested-header')).toBe('valid')
  })

  it(`${label}should respond appending headers headers`, async () => {
    const res = await fetchViaHTTP(
      context.appPort,
      `${locale}/?nested-header=true&append-me=true&cookie-me=true`
    )
    expect(res.headers.get('x-nested-header')).toBe('valid')
    expect(res.headers.get('x-append-me')).toBe('top')
    expect(res.headers.raw()['set-cookie']).toEqual(['bar=chocochip'])
  })
}
