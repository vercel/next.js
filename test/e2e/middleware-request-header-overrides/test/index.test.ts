/* eslint-env jest */

import { join } from 'path'
import { NextInstance } from 'test/lib/next-modes/base'
import { fetchViaHTTP } from 'next-test-utils'
import { createNext, FileRef } from 'e2e-utils'
import cheerio from 'cheerio'
import type { Response } from 'node-fetch'

describe('Middleware Request Headers Overrides', () => {
  let next: NextInstance

  afterAll(() => next.destroy())
  beforeAll(async () => {
    next = await createNext({
      files: {
        pages: new FileRef(join(__dirname, '../app/pages')),
        'next.config.js': new FileRef(join(__dirname, '../app/next.config.js')),
        'middleware.js': new FileRef(join(__dirname, '../app/middleware.js')),
      },
    })
  })

  describe.each([
    {
      title: 'Serverless Functions',
      path: '/api/dump-headers-serverless',
      toJson: (res: Response) => res.json(),
    },
    {
      title: 'Edge Functions',
      path: '/api/dump-headers-edge',
      toJson: (res: Response) => res.json(),
    },
    {
      title: 'getServerSideProps',
      path: '/ssr-page',
      toJson: async (res: Response) => {
        const $ = cheerio.load(await res.text())
        return JSON.parse($('#headers').text())
      },
    },
  ])('$title Backend', ({ path, toJson }) => {
    it(`Adds new headers`, async () => {
      const res = await fetchViaHTTP(next.url, path, null, {
        headers: {
          'x-from-client': 'hello-from-client',
        },
      })
      expect(await toJson(res)).toMatchObject({
        'x-from-client': 'hello-from-client',
        'x-from-middleware': 'hello-from-middleware',
      })
    })

    it(`Deletes headers`, async () => {
      const res = await fetchViaHTTP(
        next.url,
        path,
        {
          'remove-headers': 'x-from-client1,x-from-client2',
        },
        {
          headers: {
            'x-from-client1': 'hello-from-client',
            'X-From-Client2': 'hello-from-client',
          },
        }
      )

      const json = await toJson(res)
      expect(json).not.toHaveProperty('x-from-client1')
      expect(json).not.toHaveProperty('X-From-Client2')
      expect(json).toMatchObject({
        'x-from-middleware': 'hello-from-middleware',
      })

      // Should not be included in response headers.
      expect(res.headers.get('x-middleware-override-headers')).toBeNull()
      expect(
        res.headers.get('x-middleware-request-x-from-middleware')
      ).toBeNull()
      expect(res.headers.get('x-middleware-request-x-from-client1')).toBeNull()
      expect(res.headers.get('x-middleware-request-x-from-client2')).toBeNull()
    })

    it(`Updates headers`, async () => {
      const res = await fetchViaHTTP(
        next.url,
        path,
        {
          'update-headers':
            'x-from-client1=new-value1,x-from-client2=new-value2',
        },
        {
          headers: {
            'x-from-client1': 'old-value1',
            'X-From-Client2': 'old-value2',
            'x-from-client3': 'old-value3',
          },
        }
      )
      expect(await toJson(res)).toMatchObject({
        'x-from-client1': 'new-value1',
        'x-from-client2': 'new-value2',
        'x-from-client3': 'old-value3',
        'x-from-middleware': 'hello-from-middleware',
      })

      // Should not be included in response headers.
      expect(res.headers.get('x-middleware-override-headers')).toBeNull()
      expect(
        res.headers.get('x-middleware-request-x-from-middleware')
      ).toBeNull()
      expect(res.headers.get('x-middleware-request-x-from-client1')).toBeNull()
      expect(res.headers.get('x-middleware-request-x-from-client2')).toBeNull()
      expect(res.headers.get('x-middleware-request-x-from-client3')).toBeNull()
    })
  })
})
