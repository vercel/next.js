import {
  stampFlightNavigationBuildId,
  stampRuntimeDeploymentIdOnHtml,
} from 'next/dist/server/lib/stamp-runtime-deployment-id'

describe('stampRuntimeDeploymentIdOnHtml', () => {
  it('replaces a baked data-dpl-id with the runtime id', () => {
    const html =
      '<!DOCTYPE html><html data-dpl-id="dpl_aaaaaaaaaaaaaaaa" lang="en"><body>hi</body></html>'
    expect(stampRuntimeDeploymentIdOnHtml(html, 'dpl_bbbbbbbbbbbbbbbb')).toBe(
      '<!DOCTYPE html><html data-dpl-id="dpl_bbbbbbbbbbbbbbbb" lang="en"><body>hi</body></html>'
    )
  })

  it('inserts data-dpl-id when the prerender omitted it', () => {
    const html = '<!DOCTYPE html><html><body>hi</body></html>'
    expect(stampRuntimeDeploymentIdOnHtml(html, 'dpl_bbbbbbbbbbbbbbbb')).toBe(
      '<!DOCTYPE html><html data-dpl-id="dpl_bbbbbbbbbbbbbbbb"><body>hi</body></html>'
    )
  })

  it('rewrites a raw Flight payload b field that matches the baked data-dpl-id', () => {
    const html =
      '<html data-dpl-id="dpl_aaaaaaaaaaaaaaaa"><script>0:{"b":"dpl_aaaaaaaaaaaaaaaa","c":[""]}</script></html>'
    const stamped = stampRuntimeDeploymentIdOnHtml(html, 'dpl_bbbbbbbbbbbbbbbb')
    expect(stamped).toContain('data-dpl-id="dpl_bbbbbbbbbbbbbbbb"')
    expect(stamped).toContain('"b":"dpl_bbbbbbbbbbbbbbbb"')
    expect(stamped).not.toContain('dpl_aaaaaaaaaaaaaaaa')
  })
})

describe('stampFlightNavigationBuildId', () => {
  it('does not rewrite ?dpl= asset query strings', () => {
    const payload =
      '"b":"dpl_aaaaaaaaaaaaaaaa" /_next/static/chunks/main.js?dpl=dpl_aaaaaaaaaaaaaaaa'
    expect(
      stampFlightNavigationBuildId(
        payload,
        'dpl_aaaaaaaaaaaaaaaa',
        'dpl_bbbbbbbbbbbbbbbb'
      )
    ).toBe(
      '"b":"dpl_bbbbbbbbbbbbbbbb" /_next/static/chunks/main.js?dpl=dpl_aaaaaaaaaaaaaaaa'
    )
  })
})
