import { join } from 'path'
import { setupTests } from './util'

const appDir = join(__dirname, '../app')

describe('with maximumRedirects 0', () => {
  setupTests({
    nextConfigImages: {
      dangerouslyAllowLocalIP: true,
      // Configure external domains so we can try out external redirects
      domains: [
        'localhost',
        '127.0.0.1',
        'example.com',
        'assets.vercel.com',
        'image-optimization-test.vercel.app',
      ],
      // Prevent redirects
      maximumRedirects: 0,
    },
    appDir,
  })
})
