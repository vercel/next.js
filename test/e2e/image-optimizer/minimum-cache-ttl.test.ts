import { setupTests } from './util'

describe('with minimumCacheTTL of 5 sec', () => {
  setupTests({
    nextConfigImages: {
      dangerouslyAllowLocalIP: true,
      domains: [
        'localhost',
        '127.0.0.1',
        'example.com',
        'assets.vercel.com',
        'image-optimization-test.vercel.app',
      ],
      minimumCacheTTL: 5,
    },
  })
})
