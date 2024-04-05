/* eslint-env jest */

import { join } from 'path'
import { fetchViaHTTP } from 'next-test-utils'
import { NextInstance } from 'e2e-utils'
import { createNext, FileRef } from 'e2e-utils'

describe('Middleware Responses', () => {
  let next: NextInstance

  afterAll(() => next.destroy())
  beforeAll(async () => {
    next = await createNext({
      files: {
        pages: new FileRef(join(__dirname, '../app/pages')),
        'middleware.js': new FileRef(join(__dirname, '../app/middleware.js')),
        'next.config.js': new FileRef(join(__dirname, '../app/next.config.js')),
      },
    })
  })
  function testsWithLocale(locale = '') {
    const label = locale ? `${locale} ` : ``

    it(`${label}responds with multiple cookies`, async () => {
      const res = await fetchViaHTTP(next.url, `${locale}/two-cookies`)
      expect(res.headers.raw()['set-cookie']).toEqual([
        'foo=chocochip',
        'bar=chocochip',
      ])
    })

    it(`${label}should not fail when returning a stream`, async () => {
      const res = await fetchViaHTTP(next.url, `${locale}/stream-a-response`)
      expect(res.status).toBe(200)

      if (!(global as any).isNextDeploy) {
        expect(next.cliOutput).not.toContain(
          `A middleware can not alter response's body. Learn more: https://nextjs.org/docs/messages/returning-response-body-in-middleware`
        )
      }
    })

    it(`${label}should not fail when returning a text body`, async () => {
      const res = await fetchViaHTTP(next.url, `${locale}/send-response`)
      expect(res.status).toBe(200)

      if (!(global as any).isNextDeploy) {
        expect(next.cliOutput).not.toContain(
          `A middleware can not alter response's body. Learn more: https://nextjs.org/docs/messages/returning-response-body-in-middleware`
        )
      }
    })

    it(`${label}should respond with a 401 status code`, async () => {
      const res = await fetchViaHTTP(next.url, `${locale}/bad-status`)
      const html = await res.text()
      expect(res.status).toBe(401)
      expect(html).toBe('')
    })

    it(`${label}should respond with one header`, async () => {
      const res = await fetchViaHTTP(next.url, `${locale}/header`)
      expect(res.headers.get('x-first-header')).toBe('valid')
    })

    it(`${label}should respond with two headers`, async () => {
      const res = await fetchViaHTTP(
        next.url,
        `${locale}/header?nested-header=true`
      )
      expect(res.headers.get('x-first-header')).toBe('valid')
      expect(res.headers.get('x-nested-header')).toBe('valid')
    })

    it(`${label}should respond appending headers headers`, async () => {
      const res = await fetchViaHTTP(
        next.url,
        `${locale}/?nested-header=true&append-me=true&cookie-me=true`
      )
      expect(res.headers.get('x-nested-header')).toBe('valid')
      expect(res.headers.get('x-append-me')).toBe('top')
      expect(res.headers.raw()['set-cookie']).toEqual(['bar=chocochip'])
    })
  }
  testsWithLocale()
  testsWithLocale('/fr')
})
