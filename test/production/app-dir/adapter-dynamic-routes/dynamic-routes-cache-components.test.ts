import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import {
  serializeDynamicRoutes,
  type AdapterRouting,
} from './dynamic-routes-snapshot'

// This suite pins the dynamic routes that a build passes to an adapter for a
// Cache Components app. The root layout of the fixture takes one root param and
// returns two values for it.
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
// The fixture holds the shape that grows with the number of root param values.
// `generateStaticParams` on the root layout produces one fallback shell for
// each value. Each shell contributes one entry, and that entry serves three
// kinds of request:
//
// - A request for the page.
// - A request for its `.rsc` payload.
// - A per-segment prefetch.
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
     "7 entries

     /[lang]
       ^[/]?/(?<nxtPlang>[^/]+?)(\\.rsc|\\.segments/.+\\.segment\\.rsc|)(?:/)?$
       -> /[lang]$2?nxtPlang=$nxtPlang

     /$1/fallback-shell/[slug]
       ^[/]?/(de|en)/fallback\\-shell/(?<nxtPslug>[^/]+?)(\\.rsc|\\.segments/.+\\.segment\\.rsc|)(?:/)?$
       -> /$1/fallback-shell/[slug]$3?nxtPslug=$nxtPslug

     /[lang]/fallback-shell/[slug]
       ^[/]?/(?<nxtPlang>[^/]+?)/fallback\\-shell/(?<nxtPslug>[^/]+?)(\\.rsc|\\.segments/.+\\.segment\\.rsc|)(?:/)?$
       -> /[lang]/fallback-shell/[slug]$3?nxtPlang=$nxtPlang&nxtPslug=$nxtPslug

     /[lang]/ppr
       ^[/]?/(?<nxtPlang>[^/]+?)/ppr(\\.rsc|\\.segments/.+\\.segment\\.rsc|)(?:/)?$
       -> /[lang]/ppr$2?nxtPlang=$nxtPlang

     /[lang]/static
       ^[/]?/(?<nxtPlang>[^/]+?)/static(\\.rsc|\\.segments/.+\\.segment\\.rsc|)(?:/)?$
       -> /[lang]/static$2?nxtPlang=$nxtPlang

     /$1/[slug]
       ^[/]?/(de|en)/(?<nxtPslug>[^/]+?)(\\.rsc|\\.segments/.+\\.segment\\.rsc|)(?:/)?$
       -> /$1/[slug]$3?nxtPslug=$nxtPslug

     /[lang]/[slug]
       ^[/]?/(?<nxtPlang>[^/]+?)/(?<nxtPslug>[^/]+?)(\\.rsc|\\.segments/.+\\.segment\\.rsc|)(?:/)?$
       -> /[lang]/[slug]$3?nxtPlang=$nxtPlang&nxtPslug=$nxtPslug"
    `)
  })
})
