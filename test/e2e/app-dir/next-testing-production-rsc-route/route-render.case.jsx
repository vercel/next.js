import { expect, test } from 'next/experimental/testing/vitest'
import { rsc } from 'next/experimental/testing/rsc'
import { completedRequests } from './app/[tenant]/ancestor/[...slug]/state'

const expected = {
  tenant: 'acme',
  slug: ['alpha', 'c'],
  root: 'acme',
  tag: ['one', 'two'],
  unicode: '✓',
  header: 'request-value',
  cookie: 'session-value',
}

for (const format of ['html', 'flight']) {
  test(`renders the selected route and ancestors as ${format}`, async () => {
    const result = await rsc.renderRoute({
      cacheScope: 'file',
      format,
      url: 'http://localhost/acme/ancestor/alpha/c?tag=one&tag=two&unicode=%E2%9C%93',
      headers: {
        'x-route-request': format,
        'x-route-proof': 'request-value',
        cookie: 'route-session=session-value',
      },
    })
    expect(result.status).toBe(200)
    expect(result.headers['content-type']).toBe(result.contentType)
    let subject
    if (format === 'html') {
      expect(result.contentType).toContain('text/html')
      expect(result.body).toMatch(/<html(?:\s[^>]*)?>/)
      expect(result.body).toContain('data-root-layout="acme"')
      expect(result.body).toContain('data-provider="acme"')
      expect(result.body).toContain('data-nested-layout="acme"')
      expect(result.body).toContain('data-layout-header="request-value"')
      expect(result.body).toContain('data-provider-context="acme"')
      const match = result.body.match(
        /<div id="ancestor-values">([^<]+)<\/div>/
      )
      subject = JSON.parse(match[1].replaceAll('&quot;', '"'))
    } else {
      expect(result.contentType).toContain('text/x-component')
      expect(result.body).toContain('"html"')
      expect(result.body).toContain('"data-root-layout":"acme"')
      expect(result.body).toContain('"label":"acme"')
      expect(result.body).toContain('"data-nested-layout":"acme"')
      expect(result.body).toContain('"request":"flight"')
      const match = result.body.match(
        /"id":"ancestor-values","children":("(?:[^"\\]|\\.)*")/
      )
      subject = JSON.parse(JSON.parse(match[1]))
    }
    expect(subject).toEqual(expected)
    expect(completedRequests.at(-1)).toBe(format)
    console.log(
      'ANCESTOR_ROUTE ' +
        JSON.stringify({
          format,
          status: result.status,
          contentType: result.contentType,
          subject,
          after: completedRequests.at(-1),
        })
    )
  })
}

for (const format of ['html', 'flight']) {
  test(`keeps the normal ${format} not-found response status`, async () => {
    const request = `${format}-missing`
    const result = await rsc.renderRoute({
      cacheScope: 'file',
      format,
      url: 'http://localhost/acme/ancestor/alpha/c?missing=1',
      headers: { 'x-route-request': request },
    })
    expect(result.status).toBe(format === 'html' ? 404 : 200)
    expect(result.body).not.toContain('ancestor-values')
    expect(completedRequests.at(-1)).toBe(request)
    console.log(
      'ANCESTOR_ROUTE ' +
        JSON.stringify({
          kind: 'missing',
          format,
          status: result.status,
          contentType: result.contentType,
          subjectAbsent: !result.body.includes('ancestor-values'),
          after: completedRequests.at(-1),
        })
    )
  })
}
