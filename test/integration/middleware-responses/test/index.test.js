/* eslint-env jest */

import { join } from 'path'
import {
  fetchViaHTTP,
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)
const context = { appDir: join(__dirname, '../'), output: '' }

describe('Middleware Responses', () => {
  describe('dev mode', () => {
    afterAll(() => killApp(context.app))
    beforeAll(async () => {
      context.output = ''
      context.appPort = await findPort()
      context.app = await launchApp(context.appDir, context.appPort, {
        onStdout(msg) {
          context.output += msg
        },
        onStderr(msg) {
          context.output += msg
        },
      })
    })

    testsWithLocale(context)
    testsWithLocale(context, '/fr')
  })

  describe('production mode', () => {
    afterAll(() => killApp(context.app))
    beforeAll(async () => {
      context.output = ''
      await nextBuild(context.appDir)
      context.appPort = await findPort()
      context.app = await nextStart(context.appDir, context.appPort, {
        onStdout(msg) {
          context.output += msg
        },
        onStderr(msg) {
          context.output += msg
        },
      })
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

  it(`${label}should fail when returning a stream`, async () => {
    const res = await fetchViaHTTP(
      context.appPort,
      `${locale}/stream-a-response`
    )
    expect(res.status).toBe(500)
    expect(await res.text()).toEqual('Internal Server Error')
    expect(context.output).toContain(
      `A middleware can not alter response's body. Learn more: https://nextjs.org/docs/messages/returning-response-body-in-middleware`
    )
  })

  it(`${label}should fail when returning a text body`, async () => {
    const res = await fetchViaHTTP(context.appPort, `${locale}/send-response`)
    expect(res.status).toBe(500)
    expect(await res.text()).toEqual('Internal Server Error')
    expect(context.output).toContain(
      `A middleware can not alter response's body. Learn more: https://nextjs.org/docs/messages/returning-response-body-in-middleware`
    )
  })

  it(`${label}should respond with a 401 status code`, async () => {
    const res = await fetchViaHTTP(context.appPort, `${locale}/bad-status`)
    const html = await res.text()
    expect(res.status).toBe(401)
    expect(html).toBe('')
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
