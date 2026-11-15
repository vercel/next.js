/* eslint-env jest */

import {
  testShouldRedirect,
  testLinkShouldRewriteTo,
} from './shared-tests.util'
import { nextTestSetup } from 'e2e-utils'

// we don't need to exhaustively test this, just do some basic sanity checks
// for use in combination with basePath
describe('Trailing slashes with basePath, trailingSlash: true', () => {
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
})
