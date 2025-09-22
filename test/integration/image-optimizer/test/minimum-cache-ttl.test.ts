import { join } from 'path'
import { setupTests } from './util'
import { getDistDir } from 'next-test-utils'

const appDir = join(__dirname, '../app')
const imagesDir = join(appDir, getDistDir(), 'cache', 'images')

describe('with minimumCacheTTL of 5 sec', () => {
  setupTests({
    nextConfigImages: {
      // Configure external domains so we can try out
      // variations of the upstream Cache-Control header.
      domains: [
        'localhost',
        '127.0.0.1',
        'example.com',
        'assets.vercel.com',
        'image-optimization-test.vercel.app',
      ],
      // Reduce to 5 seconds so tests dont dont need to
      // wait too long before testing stale responses.
      minimumCacheTTL: 5,
    },
    appDir,
    imagesDir,
  })
})
