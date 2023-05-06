/* eslint-env jest */

import { join } from 'path'
import { fetchViaHTTP } from 'next-test-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { createNext, FileRef } from 'e2e-utils'

describe('Requests not effected when middleware used', () => {
  let next: NextInstance

  afterAll(() => next.destroy())
  beforeAll(async () => {
    next = await createNext({
      files: {
        pages: new FileRef(join(__dirname, '../app/pages')),
        'middleware.js': new FileRef(join(__dirname, '../app/middleware.js')),
      },
      dependencies: {
        request: '^2.88.2',
      },
    })
  })

  function sendRequest(method) {
    const body = !['get', 'head'].includes(method.toLowerCase())
      ? JSON.stringify({
          key: 'value',
        })
      : undefined
    it(`should proxy ${method} request ${
      body ? 'with body' : ''
    }`, async () => {
      const headers = {
        'content-type': 'application/json',
        'x-custom-header': 'some value',
      }
      const res = await fetchViaHTTP(next.url, `api`, '', {
        method: method.toUpperCase(),
        headers,
        body: method.toLowerCase() !== 'get' ? body : undefined,
      })
      const data = await res.json()
      expect(data.method).toEqual(method)
      if (body) {
        expect(data.headers['content-length'] || String(body.length)).toEqual(
          String(body.length)
        )
      }
      expect(data.headers).toEqual(expect.objectContaining(headers))
    })
  }

  sendRequest('GET')
  sendRequest('POST')
})
