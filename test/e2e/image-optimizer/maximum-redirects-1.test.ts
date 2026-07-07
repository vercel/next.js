import { setupTests } from './util'

describe('with maximumRedirects 1', () => {
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
      maximumRedirects: 1,
    },
  })
})
