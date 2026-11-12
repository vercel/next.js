import { expect, test } from 'next/experimental/testing/vitest'
import { rsc } from 'next/experimental/testing/rsc'
import { completedRequests } from './app/[tenant]/redirect/[...slug]/state'
import expected from './route-render-redirect.expected.json'

for (const variant of ['temporary', 'permanent', 'following']) {
  for (const format of ['html', 'flight']) {
    test(`${variant} redirect boundary as ${format}`, async () => {
      const request = variant + '-' + format
      const url = new URL(
        '/acme/redirect/alpha/c?tag=one&tag=two&unicode=%E2%9C%93' +
          (variant === 'following' ? '' : '&redirect=' + variant) +
          (format === 'flight' ? '&_rsc=' : ''),
        'http://localhost'
      )
      const result = await rsc.renderRoute({
        cacheScope: 'file',
        format,
        url: url.href,
        headers: {
          'x-route-request': request,
          'x-route-proof': 'request-value',
          cookie: 'route-session=session-value',
        },
      })
      expect(result.headers['content-type']).toBe(result.contentType)
      let subject = null
      if (variant === 'following') {
        if (format === 'html') {
          const value = result.body.match(
            /<div id="ancestor-values">([^<]+)<\/div>/
          )
          subject = JSON.parse(value[1].replaceAll('&quot;', '"'))
          expect(result.body).toContain('data-provider-context="acme"')
        } else {
          const value = result.body.match(
            /"id":"ancestor-values","children":("(?:[^"\\]|\\.)*")/
          )
          subject = JSON.parse(JSON.parse(value[1]))
        }
      }
      const refresh = result.body.match(
        /<meta[^>]*http-equiv="refresh"[^>]*content="([^"]*)"/
      )
      const row = {
        variant,
        format,
        pathname: url.pathname,
        search: url.search,
        status: result.status,
        contentType: result.contentType ?? null,
        location: result.headers.location ?? null,
        redirectDigest: result.body.includes('NEXT_REDIRECT'),
        refresh: refresh?.[1] ?? null,
        subject,
        after: completedRequests.at(-1),
      }
      console.log('FULL_ROUTE_REDIRECT ' + JSON.stringify(row))
      expect(row).toEqual(
        expected.rows.find(
          (value) => value.variant === variant && value.format === format
        )
      )
    })
  }
}
