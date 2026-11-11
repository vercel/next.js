import { expect, test } from 'next/experimental/testing/vitest'
import { rsc } from 'next/experimental/testing/rsc'
import Subject from './app/[tenant]/reference/[...slug]/subject'
const vectors = [
  {
    name: 'plain ASCII',
    path: '/acme/reference/alpha/c',
    params: {
      tenant: 'acme',
      slug: ['alpha', 'c'],
    },
    expected: {
      tenant: 'acme',
      slug: ['alpha', 'c'],
      root: 'acme',
      header: 'request-value',
      cookie: 'session-value',
    },
  },
  {
    name: 'spaces in root and catch-all',
    path: '/ac%20me/reference/a%20b/c',
    params: {
      tenant: 'ac me',
      slug: ['a b', 'c'],
    },
    expected: {
      tenant: 'ac%20me',
      slug: ['a%20b', 'c'],
      root: 'ac%20me',
      header: 'request-value',
      cookie: 'session-value',
    },
  },
  {
    name: 'Unicode in root and catch-all',
    path: '/%E6%9D%B1%E4%BA%AC/reference/%e2%9c%93/%F0%9F%9A%80',
    params: {
      tenant: '東京',
      slug: ['✓', '🚀'],
    },
    expected: {
      tenant: '%E6%9D%B1%E4%BA%AC',
      slug: ['%E2%9C%93', '%F0%9F%9A%80'],
      root: '%E6%9D%B1%E4%BA%AC',
      header: 'request-value',
      cookie: 'session-value',
    },
  },
  {
    name: 'literal percent and encoded slash',
    path: '/acme/reference/%2520/%252F/a%2Fb',
    params: {
      tenant: 'acme',
      slug: ['%20', '%2F', 'a/b'],
    },
    expected: {
      tenant: 'acme',
      slug: ['%2520', '%252F', 'a%2Fb'],
      root: 'acme',
      header: 'request-value',
      cookie: 'session-value',
    },
  },
]
for (const vector of vectors) {
  test(vector.name, async () => {
    const url = new URL(vector.path, 'http://localhost')
    const result = await rsc.render(
      Subject,
      { params: Promise.resolve(vector.params) },
      {
        cacheScope: 'file',
        url: url.href,
        headers: {
          'x-route-proof': 'request-value',
          cookie: 'route-session=session-value',
        },
        rootParams: { tenant: vector.params.tenant },
      }
    )
    console.log(
      'RSC_ROUTE_RAW ' +
        JSON.stringify({
          name: vector.name,
          pathname: url.pathname,
          text: result.text,
        })
    )
    expect(result.text).toBe(JSON.stringify(vector.expected))
  })
}
