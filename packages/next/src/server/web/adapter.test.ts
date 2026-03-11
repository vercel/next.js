import type { AdapterOptions } from './adapter'
import { adapter } from './adapter'
import { normalizeRscURL } from '../../shared/lib/router/utils/app-paths'
jest.mock('../../shared/lib/router/utils/app-paths', () => ({
  normalizeRscURL: jest.fn((url: string) => url),
}))

describe('adapter', () => {
  it('does not normalize the URL when __NEXT_NO_MIDDLEWARE_URL_NORMALIZE is set', async () => {
    process.env.__NEXT_NO_MIDDLEWARE_URL_NORMALIZE = '1'

    await adapter({
      page: '/',
      bypassNextUrl: true,
      handler: async () => new Response(null),
      request: {
        url: 'http://example.com/test.rsc',
        method: 'GET',
        headers: {},
        nextConfig: {},
      },
    } as unknown as AdapterOptions)

    expect(normalizeRscURL).not.toHaveBeenCalled()
  })
})
