import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import {
  serializeDynamicRoutes,
  type AdapterRouting,
} from './dynamic-routes-snapshot'

// This suite pins the dynamic routes that a build passes to an adapter for
// an app router project without Cache Components. The fixture also holds one
// pages router route.
//
// The fixture covers the parts of this output that do not depend on Cache
// Components:
//
// - The `.rsc` entry and the plain entry that each dynamic app page receives.
// - The entries that a route handler receives.
// - Several pages that share one shape and differ in a static last segment.
// - A pages router route that sets `fallback: false`.
// - Two static pages router pages, next to a proxy.
//
// The `fallback: false` route decides whether a merge is possible. Its plain
// entry carries a preview bypass condition. Its `.rsc` entry does not carry
// that condition.
//
// A proxy next to a pages router adds one entry for each static pages router
// page. That entry maps the `_next/data` URL of the page to the page itself.
// The count of those entries grows with the number of pages rather than with
// the number of route shapes.
describe('adapter dynamic routes (legacy)', () => {
  const { next } = nextTestSetup({
    files: path.join(__dirname, 'legacy'),
    // The fixture sets `generateBuildId`, and this option lets that value
    // take effect. The harness otherwise assigns a new build ID for each run.
    // The source regex of a pages router data route holds the build ID.
    disableAutoSkewProtection: true,
  })

  it('emits the expected dynamic routes', async () => {
    const routing: AdapterRouting = await next.readJSON('build-complete.json')

    expect(serializeDynamicRoutes(routing.dynamicRoutes))
      .toMatchInlineSnapshot(`
     "9 entries

     /legacy/[id]
       ^/_next/data/test\\-build\\-id[/]?/legacy/(?<nxtPid>[^/]+?)\\.json(?:/)?$
       -> /_next/data/test-build-id/legacy/[id].json?nxtPid=$nxtPid
       [has cookie __prerender_bypass, has cookie __next_preview_data]

     /static-one
       ^/_next/data/test\\-build\\-id[/]?/static\\-one\\.json(?:/)?$
       -> /static-one

     /static-two
       ^/_next/data/test\\-build\\-id[/]?/static\\-two\\.json(?:/)?$
       -> /static-two

     /blog/[slug]
       ^[/]?/blog/(?<nxtPslug>[^/]+?)(?<rscSuffix>\\.rsc|\\.segments/.+\\.segment\\.rsc|)(?:/)?$
       -> /blog/[slug]$rscSuffix?nxtPslug=$nxtPslug

     /docs/[lang]/accounts
       ^[/]?/docs/(?<nxtPlang>[^/]+?)/accounts(?<rscSuffix>\\.rsc|\\.segments/.+\\.segment\\.rsc|)(?:/)?$
       -> /docs/[lang]/accounts$rscSuffix?nxtPlang=$nxtPlang

     /docs/[lang]/functions
       ^[/]?/docs/(?<nxtPlang>[^/]+?)/functions(?<rscSuffix>\\.rsc|\\.segments/.+\\.segment\\.rsc|)(?:/)?$
       -> /docs/[lang]/functions$rscSuffix?nxtPlang=$nxtPlang

     /docs/[lang]/guide
       ^[/]?/docs/(?<nxtPlang>[^/]+?)/guide(?<rscSuffix>\\.rsc|\\.segments/.+\\.segment\\.rsc|)(?:/)?$
       -> /docs/[lang]/guide$rscSuffix?nxtPlang=$nxtPlang

     /legacy/[id].rsc
       ^[/]?/legacy/(?<nxtPid>[^/]+?)(?<rscSuffix>\\.rsc|\\.segments/.+\\.segment\\.rsc)(?:/)?$
       -> /legacy/[id]$rscSuffix?nxtPid=$nxtPid

     /legacy/[id]
       ^[/]?/legacy/(?<nxtPid>[^/]+?)(?:/)?$
       -> /legacy/[id]?nxtPid=$nxtPid
       [has cookie __prerender_bypass, has cookie __next_preview_data]"
    `)
  })
})
