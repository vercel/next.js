import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { fetchViaHTTP } from 'next-test-utils'

describe('Edge vs. non-Edge API route priority', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/api/user/login.js': `
            export default async function handler(_, res) {
              res.send('from login.js')
            }
        `,
        'pages/api/user/[id].js': `
          export const config = {
            runtime: 'experimental-edge',
          }
          export default async function handler() {
            return new Response('from [id].js')
          }`,
      },
      dependencies: {},
    })
  })
  afterAll(() => next.destroy())

  it('more specific route should match', async () => {
    const res = await fetchViaHTTP(next.url, '/api/user/login')
    expect(await res.text()).toBe('from login.js')
  })
})
