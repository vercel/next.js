import { expect, test } from 'next/experimental/testing/vitest'
import { rsc } from 'next/experimental/testing/rsc'
import { completedRequests } from './app/[tenant]/ancestor/[...slug]/state'
import vectors from './route-render-encoded.vectors.json'
import expected from './route-render-encoded.expected.json'

for (const [index, vector] of vectors.entries()) {
  for (const format of ['html', 'flight']) {
    test(`${vector.name} as ${format}`, async () => {
      const request = `encoded-${index}-${format}`
      const url = new URL(
        vector.pathname +
          '?tag=one&tag=two&tag=%252F&unicode=%25%20%2F%E2%9C%93' +
          (format === 'flight' ? '&_rsc=' : ''),
        'http://localhost'
      )
      const result = await rsc.renderRoute({
        cacheScope: 'file',
        format,
        url: url.href,
        rootParams: { tenant: vector.tenant },
        headers: {
          'x-route-request': request,
          'x-route-proof': 'request-value',
          cookie: 'route-session=session-value',
        },
      })
      expect(result.headers['content-type']).toBe(result.contentType)
      let subject, ancestors
      if (format === 'html') {
        expect(result.body).toMatch(/<html(?:\s[^>]*)?>/)
        const value = result.body.match(
          /<div id="ancestor-values">([^<]+)<\/div>/
        )
        subject = JSON.parse(value[1].replaceAll('&quot;', '"'))
        const attribute = (name) => {
          const match = result.body.match(new RegExp(name + '="([^"]*)"'))
          expect(match).toBeTruthy()
          return match[1]
        }
        ancestors = {
          document: 'html',
          rootLayout: attribute('data-root-layout'),
          provider: attribute('data-provider'),
          nestedLayout: attribute('data-nested-layout'),
          layoutHeader: attribute('data-layout-header'),
          providerContext: attribute('data-provider-context'),
          clientRequest: request,
        }
        expect(result.body).toContain('>' + request + '</span>')
      } else {
        expect(result.body).toContain('"html"')
        const value = result.body.match(
          /"id":"ancestor-values","children":("(?:[^"\\]|\\.)*")/
        )
        subject = JSON.parse(JSON.parse(value[1]))
        const property = (name) => {
          const match = result.body.match(
            new RegExp('"' + name + '":("(?:[^"\\\\]|\\\\.)*")')
          )
          expect(match).toBeTruthy()
          return JSON.parse(match[1])
        }
        ancestors = {
          document: 'html',
          rootLayout: property('data-root-layout'),
          provider: property('label'),
          nestedLayout: property('data-nested-layout'),
          layoutHeader: property('data-layout-header'),
          providerContext: null,
          clientRequest: property('request'),
        }
      }
      const row = {
        name: vector.name,
        format,
        pathname: url.pathname,
        search: url.search,
        status: result.status,
        contentType: result.contentType,
        subject,
        ancestors,
        after: completedRequests.at(-1),
      }
      console.log('FULL_ROUTE_ENCODED ' + JSON.stringify(row))
      expect(row).toEqual(
        expected.rows.find(
          (value) => value.name === vector.name && value.format === format
        )
      )
    })
  }
}
