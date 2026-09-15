import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import {
  serializeDynamicRoutes,
  type AdapterRouting,
} from './dynamic-routes-snapshot'

// This suite pins the dynamic routes for an app whose root layout takes two
// root params.
//
// The fixture returns three combinations of the two root params, and not the
// full product of four. The build produces one fallback shell for each of the
// three, and each shell contributes one entry. No entry matches the fourth
// combination, `sparse/de`, because the build produces no output for it.
//
// One combination contains `.`, `-` and `,`. A regex treats those characters as
// special, and the patterns below escape them.
describe('adapter dynamic routes (shell prefixes)', () => {
  const { next } = nextTestSetup({
    files: path.join(__dirname, 'shell-prefixes'),
    // The fixture sets `generateBuildId`, and this option lets that value take
    // effect. The harness otherwise assigns a new build ID for each run. A
    // build ID that reaches an entry then changes the assertions on every run.
    disableAutoSkewProtection: true,
  })

  it('emits the expected dynamic routes', async () => {
    const routing: AdapterRouting = await next.readJSON('build-complete.json')

    expect(serializeDynamicRoutes(routing.dynamicRoutes))
      .toMatchInlineSnapshot(`
     "2 entries

     /$shellPrefix/posts/[id]
       ^[/]?/(?<shellPrefix>acme\\.one\\-two,three/de|acme\\.one\\-two,three/en|sparse/en)/posts/(?<nxtPid>[^/]+?)(?<rscSuffix>\\.rsc|\\.segments/.+\\.segment\\.rsc|)(?:/)?$
       -> /$shellPrefix/posts/[id]$rscSuffix?nxtPid=$nxtPid

     /[team]/[locale]/posts/[id]
       ^[/]?/(?<nxtPteam>[^/]+?)/(?<nxtPlocale>[^/]+?)/posts/(?<nxtPid>[^/]+?)(?<rscSuffix>\\.rsc|\\.segments/.+\\.segment\\.rsc|)(?:/)?$
       -> /[team]/[locale]/posts/[id]$rscSuffix?nxtPteam=$nxtPteam&nxtPlocale=$nxtPlocale&nxtPid=$nxtPid"
    `)
  })
})
