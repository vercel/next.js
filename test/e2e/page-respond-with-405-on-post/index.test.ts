import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { fetchViaHTTP } from 'next-test-utils'

describe('Page respond with 405 on POST', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/index.js': 'export default function Page() {}',
      },
      dependencies: {},
    })
  })
  afterAll(() => next.destroy())

  it('should work', async () => {
    const res = await fetchViaHTTP(next.url, '/', undefined, {
      method: 'POST',
    })
    expect(res.status).toBe(405)
  })
})
