/* eslint-env jest */

import {
  testShouldRedirect,
  testLinkShouldRewriteTo,
} from './shared-tests.util'
import { nextTestSetup, isNextDev } from 'e2e-utils'

// we don't need to exhaustively test this, just do some basic sanity checks
// for use in combiantion with basePath
;(isNextDev ? describe : describe.skip)(
  'Trailing slashes in development mode, with basepath, trailingSlash: true',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
      nextConfig: {
        trailingSlash: true,
        basePath: '/docs',
      },
    })

    testShouldRedirect(next, [
      ['/docs/about', '/docs/about/'],
      ['/docs', '/docs/'],
      ['/docs/catch-all/hello/world', '/docs/catch-all/hello/world/'],
      ['/docs/catch-all/hello.world/', '/docs/catch-all/hello.world'],
    ])

    testLinkShouldRewriteTo(next, [
      ['/docs/linker?href=/about', '/docs/about/'],
      ['/docs/linker?href=/', '/docs/'],
    ])
  }
)
