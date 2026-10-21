import { expect, test } from 'next/experimental/testing/vitest'
import { rsc } from 'next/experimental/testing/rsc'
import { completedRequests } from './app/[tenant]/panel/state'
import expected from './route-parallel-default.expected.json'

export function defineParallelDefaultCases(path) {
  for (const format of ['html', 'flight']) {
    test(`renders real default slots on ${path} as ${format}`, async () => {
      const request = `${format}-${path.endsWith('report') ? 'nested' : 'root'}`
      const url = new URL(path + '?tag=one&tag=two', 'http://localhost')
      if (format === 'flight') url.searchParams.set('_rsc', '')
      const result = await rsc.renderRoute({
        cacheScope: 'file',
        format,
        url,
        headers: {
          'x-parallel-request': request,
          'x-parallel-proof': 'request-value',
          cookie: 'parallel-session=session-value',
        },
      })
      expect(result.headers['content-type']).toBe(result.contentType)
      const subjects = ['children', 'activity', 'metrics'].map((role) => {
        const expression =
          format === 'html'
            ? new RegExp(`<pre id="parallel-${role}">([^<]+)</pre>`)
            : new RegExp(
                `"id":"parallel-${role}","children":("(?:[^"\\\\]|\\\\.)*")`
              )
        const match = result.body.match(expression)
        expect(match).not.toBeNull()
        return format === 'html'
          ? JSON.parse(
              match[1].replaceAll('&quot;', '"').replaceAll('&amp;', '&')
            )
          : JSON.parse(JSON.parse(match[1]))
      })
      const rootLayout = result.body.includes(
        format === 'html'
          ? 'data-root-layout="acme"'
          : '"data-root-layout":"acme"'
      )
      const parallelLayout = result.body.includes(
        format === 'html'
          ? 'data-parallel-layout="default-slots"'
          : '"data-parallel-layout":"default-slots"'
      )
      expect(result.body).toContain(
        format === 'html' ? 'data-provider-context="acme"' : '"label":"acme"'
      )
      expect(result.body).toContain(
        format === 'html'
          ? `data-parallel-client="${request}"`
          : `"request":"${request}"`
      )
      const row = {
        path,
        format,
        status: result.status,
        contentType: result.contentType,
        subjects,
        rootLayout,
        parallelLayout,
        provider: 'acme',
        clientRequest: request,
        after: completedRequests.at(-1),
      }
      expect(row).toEqual(
        expected.find((entry) => entry.path === path && entry.format === format)
      )
      console.log('PARALLEL_ROUTE ' + JSON.stringify(row))
    })
  }
}
