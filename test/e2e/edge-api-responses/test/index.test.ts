/* eslint-env jest */

import { join } from 'path'
import { NextInstance } from 'test/lib/next-modes/base'
import { createNext, FileRef } from 'e2e-utils'

/* eslint-env jest */
import { fetchViaHTTP } from 'next-test-utils'

describe('Edge API Responses', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        // app: new FileRef(join(__dirname, './app')),
        pages: new FileRef(join(__dirname, './pages')),
        utils: new FileRef(join(__dirname, './utils')),
        'next.config.js': new FileRef(join(__dirname, './next.config.js')),
      },
      dependencies: {
        react: 'experimental',
        'react-dom': 'experimental',
      },
    })
  })
  afterAll(() => next.destroy())

  const root = '/api'

  it(`${root} responds with multiple cookies`, async () => {
    const res = await fetchViaHTTP(next.url, `${root}/two-cookies`)
    expect(res.headers.raw()['set-cookie']).toEqual([
      'foo=chocochip',
      'bar=chocochip',
    ])
  })

  it(`${root} should fail when returning a stream`, async () => {
    const res = await fetchViaHTTP(next.url, `${root}/stream-a-response`)
    expect(res.status).toBe(500)

    if ((global as any).isNextDeploy) {
      expect(await res.text()).toContain('EDGE_FUNCTION_INVOCATION_FAILED')
    } else {
      expect(await res.text()).toEqual('Internal Server Error')
      expect(next.cliOutput).toContain(
        `A middleware can not alter response's body. Learn more: https://nextjs.org/docs/messages/returning-response-body-in-middleware`
      )
    }
  })

  it(`${root} should fail when returning a text body`, async () => {
    const res = await fetchViaHTTP(next.url, `${root}/send-response`)
    expect(res.status).toBe(500)

    if ((global as any).isNextDeploy) {
      expect(await res.text()).toContain('EDGE_FUNCTION_INVOCATION_FAILED')
    } else {
      expect(await res.text()).toEqual('Internal Server Error')
      expect(next.cliOutput).toContain(
        `A middleware can not alter response's body. Learn more: https://nextjs.org/docs/messages/returning-response-body-in-middleware`
      )
    }
  })

  it(`${root} should respond with a 401 status code`, async () => {
    const res = await fetchViaHTTP(next.url, `${root}/bad-status`)
    const html = await res.text()
    expect(res.status).toBe(401)
    expect(html).toBe('')
  })

  it(`${root} should respond with one header`, async () => {
    const res = await fetchViaHTTP(next.url, `${root}/header`)
    expect(res.headers.get('x-first-header')).toBe('valid')
  })

  it(`${root} should respond with two headers`, async () => {
    const res = await fetchViaHTTP(
      next.url,
      `${root}/header?nested-header=true`
    )
    expect(res.headers.get('x-first-header')).toBe('valid')
    expect(res.headers.get('x-nested-header')).toBe('valid')
  })

  it(`${root} should respond appending headers headers`, async () => {
    const res = await fetchViaHTTP(
      next.url,
      `${root}/?nested-header=true&append-me=true&cookie-me=true`
    )
    expect(res.headers.get('x-nested-header')).toBe('valid')
    expect(res.headers.get('x-append-me')).toBe('top')
    expect(res.headers.raw()['set-cookie']).toEqual(['bar=chocochip'])
  })
})
