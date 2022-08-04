import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { fetchViaHTTP } from 'next-test-utils'
import path from 'path'

describe('Edge Runtime APIs can be consumed from next/server', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: new FileRef(path.join(__dirname, './app')),
      dependencies: {},
    })
  })
  afterAll(() => next.destroy())

  describe('Edge runtime', () => {
    defineTests('edge')
  })

  describe('Node.js runtime', () => {
    defineTests('node')
  })

  function defineTests(target: 'node' | 'edge') {
    test('URLPattern', async () => {
      const response = await fetchViaHTTP(
        next.url,
        `/api/${target}/url-pattern`,
        {
          pattern: 'https://example.vercel.sh/:a/:b/:c',
          test: 'https://example.vercel.sh/1/2/3',
        }
      )
      await expect(response.json()).resolves.toEqual({
        pattern: 'https://example.vercel.sh/:a/:b/:c',
        test: 'https://example.vercel.sh/1/2/3',
        pathname: {
          input: '/1/2/3',
          groups: { a: '1', b: '2', c: '3' },
        },
      })
    })
  }
})
