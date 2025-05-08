/* eslint-env jest */
/* eslint-disable jest/no-standalone-expect */

import {
  testShouldRedirect,
  testLinkShouldRewriteTo,
  testShouldResolve,
  testExternalLinkShouldRewriteTo,
} from './shared-tests.util'
import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'

describe('Trailing slashes with trailingSlash: true', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
    nextConfig: {
      trailingSlash: true,
    },
  })

  testShouldRedirect(next, [
    ['/about', '/about/'],
    ['/catch-all/hello/world', '/catch-all/hello/world/'],
    ['/catch-all/hello.world/', '/catch-all/hello.world'],
  ])

  testShouldResolve(next, [
    // visited url, expected page, expected router path
    ['/', '/index.js', '/'],
    ['/about/', '/about.js', '/about'],
    [
      '/catch-all/hello/world/',
      '/catch-all/[...slug].js',
      '/catch-all/[...slug]',
    ],
    ['/about/?hello=world', '/about.js', '/about'],
  ])

  testLinkShouldRewriteTo(next, [
    ['/linker?href=/', '/'],
    ['/linker?href=/about', '/about/'],
    ['/linker?href=/about/', '/about/'],
    ['/linker?href=/about?hello=world', '/about/?hello=world'],
    ['/linker?href=/about/?hello=world', '/about/?hello=world'],
    ['/linker?href=/catch-all/hello/', '/catch-all/hello/'],
    ['/linker?href=/catch-all/hello.world/', '/catch-all/hello.world'],
  ])

  testExternalLinkShouldRewriteTo(next, [
    [
      `/external-linker?href=${encodeURI('https://nextjs.org')}`,
      'https://nextjs.org',
    ],
    [
      `/external-linker?href=${encodeURI('https://nextjs.org/')}`,
      'https://nextjs.org/',
    ],
  ])

  // only prod builds have a manifest
  ;(isNextStart ? it : it.skip)(
    'should have a trailing redirect in the routesmanifest',
    async () => {
      const manifest = await next.readJSON(
        join('.next', 'routes-manifest.json')
      )
      expect(manifest).toEqual(
        expect.objectContaining({
          redirects: expect.arrayContaining([
            expect.objectContaining({
              source:
                '/:file((?!\\.well-known(?:/.*)?)(?:[^/]+/)*[^/]+\\.\\w+)/',
              destination: '/:file',
              statusCode: 308,
            }),
            expect.objectContaining({
              source: '/:notfile((?!\\.well-known(?:/.*)?)(?:[^/]+/)*[^/\\.]+)',
              destination: '/:notfile/',
              statusCode: 308,
            }),
          ]),
        })
      )
    }
  )
})
