import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import {
  serializeDynamicRoutes,
  type AdapterRouting,
} from './dynamic-routes-snapshot'

// This suite pins the dynamic routes for an app that has no root params. The
// root layout sits above the dynamic segments, so `team` and `locale` are
// ordinary dynamic params, and `generateStaticParams` on a nested layout
// enumerates them.
//
// The build produces two shapes of entry for one source page here:
//
// - An entry that resolves both params, such as `/sparse/en/posts/[id]`.
// - An entry that resolves only `team`, such as `/sparse/[locale]/posts/[id]`.
//
// The two shapes alternate, so only neighbours of one shape collapse into a
// single entry. The two entries for the `acme.one-two,three` team that resolve
// both params are such a pair. The entry for the `sparse` team that resolves
// both params has an entry of the other shape on each side, so it stays as it
// is.
//
// The order of the entries carries the behavior. An entry that resolves both
// params comes before an entry that resolves one, so a request for
// `/sparse/en/posts/1` reaches the output for `/sparse/en/posts/[id]` and not
// the one for `/sparse/[locale]/posts/[id]`. A collapsed entry takes the
// position of the first entry that it replaces, and a run of neighbours stops
// at any route of another shape, so every replaced entry keeps its place
// relative to the routes around it.
describe('adapter dynamic routes (no root params)', () => {
  const { next } = nextTestSetup({
    files: path.join(__dirname, 'no-root-params'),
    // The fixture sets `generateBuildId`, and this option lets that value take
    // effect. The harness otherwise assigns a new build ID for each run. A
    // build ID that reaches an entry then changes the assertions on every run.
    disableAutoSkewProtection: true,
  })

  it('emits the expected dynamic routes', async () => {
    const routing: AdapterRouting = await next.readJSON('build-complete.json')

    expect(serializeDynamicRoutes(routing.dynamicRoutes))
      .toMatchInlineSnapshot(`
     "5 entries

     /$shellPrefix/posts/[id]
       ^[/]?/(?<shellPrefix>acme\\.one\\-two,three/de|acme\\.one\\-two,three/en)/posts/(?<nxtPid>[^/]+?)(?<rscSuffix>\\.rsc|\\.segments/.+\\.segment\\.rsc|)(?:/)?$
       -> /$shellPrefix/posts/[id]$rscSuffix?nxtPid=$nxtPid

     /acme.one-two,three/[locale]/posts/[id]
       ^[/]?/acme\\.one\\-two,three/(?<nxtPlocale>[^/]+?)/posts/(?<nxtPid>[^/]+?)(?<rscSuffix>\\.rsc|\\.segments/.+\\.segment\\.rsc|)(?:/)?$
       -> /acme.one-two,three/[locale]/posts/[id]$rscSuffix?nxtPlocale=$nxtPlocale&nxtPid=$nxtPid

     /sparse/en/posts/[id]
       ^[/]?/sparse/en/posts/(?<nxtPid>[^/]+?)(?<rscSuffix>\\.rsc|\\.segments/.+\\.segment\\.rsc|)(?:/)?$
       -> /sparse/en/posts/[id]$rscSuffix?nxtPid=$nxtPid

     /sparse/[locale]/posts/[id]
       ^[/]?/sparse/(?<nxtPlocale>[^/]+?)/posts/(?<nxtPid>[^/]+?)(?<rscSuffix>\\.rsc|\\.segments/.+\\.segment\\.rsc|)(?:/)?$
       -> /sparse/[locale]/posts/[id]$rscSuffix?nxtPlocale=$nxtPlocale&nxtPid=$nxtPid

     /[team]/[locale]/posts/[id]
       ^[/]?/(?<nxtPteam>[^/]+?)/(?<nxtPlocale>[^/]+?)/posts/(?<nxtPid>[^/]+?)(?<rscSuffix>\\.rsc|\\.segments/.+\\.segment\\.rsc|)(?:/)?$
       -> /[team]/[locale]/posts/[id]$rscSuffix?nxtPteam=$nxtPteam&nxtPlocale=$nxtPlocale&nxtPid=$nxtPid"
    `)
  })
})
