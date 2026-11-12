import { expect, test } from 'next/experimental/testing/vitest'
import { rsc } from 'next/experimental/testing/rsc'
import Subject from './app/[tenant]/reference/[...slug]/subject'
test('explicit route retains params root params headers and cookies', async () => {
  const result = await rsc.render(
    Subject,
    { params: Promise.resolve({ tenant: 'acme', slug: ['alpha', 'c'] }) },
    {
      cacheScope: 'file',
      url: 'http://localhost/acme/reference/alpha/c',
      headers: {
        'x-route-proof': 'request-value',
        cookie: 'route-session=session-value',
      },
      rootParams: { tenant: 'acme' },
    }
  )
  expect(result.text).toBe(
    JSON.stringify({
      tenant: 'acme',
      slug: ['alpha', 'c'],
      root: 'acme',
      header: 'request-value',
      cookie: 'session-value',
    })
  )
  console.log(
    'RSC_ROUTE_RAW ' +
      JSON.stringify({
        text: result.text,
        clientReferences: result.clientReferences,
      })
  )
})
