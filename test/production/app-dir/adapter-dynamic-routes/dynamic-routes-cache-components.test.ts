import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import {
  serializeDynamicRoutes,
  type AdapterRouting,
} from './dynamic-routes-snapshot'

// This suite pins the dynamic routes that a build passes to an adapter for
// a Cache Components app. The root layout of the fixture returns two root
// params.
//
// Each entry in the snapshot becomes one route in the routes document of a
// deployment. The snapshot covers the routes that this app shape contributes.
// A deployment also carries a fixed set of adapter routes, and it carries one
// route for each rewrite that the app config declares.
//
// A route without a dynamic segment contributes no entry. A request for that
// route matches an output during the filesystem check, so it needs no
// rewrite.
//
// The fixture holds the shape that grows with the number of root param
// combinations. `generateStaticParams` on the root layout produces one
// fallback shell for each combination. Each manifest entry then produces
// two adapter entries:
//
// - An `.rsc` route.
// - A plain route.
describe('adapter dynamic routes (cache components)', () => {
  const { next } = nextTestSetup({
    files: path.join(__dirname, 'cache-components'),
    // The fixture sets `generateBuildId`, and this option lets that value
    // take effect. The harness otherwise assigns a new build ID for each run.
    // A build ID that reaches an entry then changes the assertions on every
    // run.
    disableAutoSkewProtection: true,
  })

  it('emits the expected dynamic routes', async () => {
    const routing: AdapterRouting = await next.readJSON('build-complete.json')

    expect(serializeDynamicRoutes(routing.dynamicRoutes))
      .toMatchInlineSnapshot(`
     "18 entries

     /[lang].rsc
       ^[/]?/(?<nxtPlang>[^/]+?)(?<rscSuffix>\\.rsc|\\.segments/.+\\.segment\\.rsc)(?:/)?$
       -> /[lang]$rscSuffix?nxtPlang=$nxtPlang

     /[lang]
       ^[/]?/(?<nxtPlang>[^/]+?)(?:/)?$
       -> /[lang]?nxtPlang=$nxtPlang

     /de/fallback-shell/[slug].rsc
       ^[/]?/de/fallback\\-shell/(?<nxtPslug>[^/]+?)(?<rscSuffix>\\.rsc|\\.segments/.+\\.segment\\.rsc)(?:/)?$
       -> /de/fallback-shell/[slug]$rscSuffix?nxtPslug=$nxtPslug

     /de/fallback-shell/[slug]
       ^[/]?/de/fallback\\-shell/(?<nxtPslug>[^/]+?)(?:/)?$
       -> /de/fallback-shell/[slug]?nxtPslug=$nxtPslug

     /en/fallback-shell/[slug].rsc
       ^[/]?/en/fallback\\-shell/(?<nxtPslug>[^/]+?)(?<rscSuffix>\\.rsc|\\.segments/.+\\.segment\\.rsc)(?:/)?$
       -> /en/fallback-shell/[slug]$rscSuffix?nxtPslug=$nxtPslug

     /en/fallback-shell/[slug]
       ^[/]?/en/fallback\\-shell/(?<nxtPslug>[^/]+?)(?:/)?$
       -> /en/fallback-shell/[slug]?nxtPslug=$nxtPslug

     /[lang]/fallback-shell/[slug].rsc
       ^[/]?/(?<nxtPlang>[^/]+?)/fallback\\-shell/(?<nxtPslug>[^/]+?)(?<rscSuffix>\\.rsc|\\.segments/.+\\.segment\\.rsc)(?:/)?$
       -> /[lang]/fallback-shell/[slug]$rscSuffix?nxtPlang=$nxtPlang&nxtPslug=$nxtPslug

     /[lang]/fallback-shell/[slug]
       ^[/]?/(?<nxtPlang>[^/]+?)/fallback\\-shell/(?<nxtPslug>[^/]+?)(?:/)?$
       -> /[lang]/fallback-shell/[slug]?nxtPlang=$nxtPlang&nxtPslug=$nxtPslug

     /[lang]/ppr.rsc
       ^[/]?/(?<nxtPlang>[^/]+?)/ppr(?<rscSuffix>\\.rsc|\\.segments/.+\\.segment\\.rsc)(?:/)?$
       -> /[lang]/ppr$rscSuffix?nxtPlang=$nxtPlang

     /[lang]/ppr
       ^[/]?/(?<nxtPlang>[^/]+?)/ppr(?:/)?$
       -> /[lang]/ppr?nxtPlang=$nxtPlang

     /[lang]/static.rsc
       ^[/]?/(?<nxtPlang>[^/]+?)/static(?<rscSuffix>\\.rsc|\\.segments/.+\\.segment\\.rsc)(?:/)?$
       -> /[lang]/static$rscSuffix?nxtPlang=$nxtPlang

     /[lang]/static
       ^[/]?/(?<nxtPlang>[^/]+?)/static(?:/)?$
       -> /[lang]/static?nxtPlang=$nxtPlang

     /de/[slug].rsc
       ^[/]?/de/(?<nxtPslug>[^/]+?)(?<rscSuffix>\\.rsc|\\.segments/.+\\.segment\\.rsc)(?:/)?$
       -> /de/[slug]$rscSuffix?nxtPslug=$nxtPslug

     /de/[slug]
       ^[/]?/de/(?<nxtPslug>[^/]+?)(?:/)?$
       -> /de/[slug]?nxtPslug=$nxtPslug

     /en/[slug].rsc
       ^[/]?/en/(?<nxtPslug>[^/]+?)(?<rscSuffix>\\.rsc|\\.segments/.+\\.segment\\.rsc)(?:/)?$
       -> /en/[slug]$rscSuffix?nxtPslug=$nxtPslug

     /en/[slug]
       ^[/]?/en/(?<nxtPslug>[^/]+?)(?:/)?$
       -> /en/[slug]?nxtPslug=$nxtPslug

     /[lang]/[slug].rsc
       ^[/]?/(?<nxtPlang>[^/]+?)/(?<nxtPslug>[^/]+?)(?<rscSuffix>\\.rsc|\\.segments/.+\\.segment\\.rsc)(?:/)?$
       -> /[lang]/[slug]$rscSuffix?nxtPlang=$nxtPlang&nxtPslug=$nxtPslug

     /[lang]/[slug]
       ^[/]?/(?<nxtPlang>[^/]+?)/(?<nxtPslug>[^/]+?)(?:/)?$
       -> /[lang]/[slug]?nxtPlang=$nxtPlang&nxtPslug=$nxtPslug"
    `)
  })
})
