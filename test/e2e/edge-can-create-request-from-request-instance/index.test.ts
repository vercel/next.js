import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { fetchViaHTTP } from 'next-test-utils'
import path from 'path'

describe('Edge runtime creates request form request instance', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/api/edge.js': new FileRef(
          path.resolve(__dirname, './app/pages/api/edge.js')
        ),
      },
      dependencies: {},
    })
  })
  afterAll(() => next.destroy())

  it('creates correct request from request', async () => {
    const res = await fetchViaHTTP(next.url, '/api/edge', {}, { method: 'GET' })

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('Created Request from Request instance')
  })
})
