import { setupTests } from './util'

// Deployments use the Vercel image CDN instead of the local image pipeline.
// @force-gate !deploy
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
