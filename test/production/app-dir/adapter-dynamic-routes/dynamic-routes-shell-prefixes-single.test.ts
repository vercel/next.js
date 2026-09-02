import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import {
  serializeDynamicRoutes,
  type AdapterRouting,
} from './dynamic-routes-snapshot'

// This suite builds the shell prefixes fixture with one combination of root
// param values, so each source page has one fallback shell.
//
// An alternation of one combination saves no entry, and it would replace a
// literal path with a capture group for no gain. The entry for the shell
// therefore keeps the combination as it is.
describe('adapter dynamic routes (shell prefixes, one combination)', () => {
  const { next } = nextTestSetup({
    files: path.join(__dirname, 'shell-prefixes'),
    env: { SINGLE_COMBINATION: '1' },
    // The fixture sets `generateBuildId`, and this option lets that value take
    // effect. The harness otherwise assigns a new build ID for each run. A
    // build ID that reaches an entry then changes the assertions on every run.
    disableAutoSkewProtection: true,
  })

  it('keeps the combination in the entry for a lone shell', async () => {
    const routing: AdapterRouting = await next.readJSON('build-complete.json')

    expect(serializeDynamicRoutes(routing.dynamicRoutes))
      .toMatchInlineSnapshot(`
     "2 entries

     /acme.one-two,three/en/posts/[id]
       ^[/]?/acme\\.one\\-two,three/en/posts/(?<nxtPid>[^/]+?)(?<rscSuffix>\\.rsc|\\.segments/.+\\.segment\\.rsc|)(?:/)?$
       -> /acme.one-two,three/en/posts/[id]$rscSuffix?nxtPid=$nxtPid

     /[team]/[locale]/posts/[id]
       ^[/]?/(?<nxtPteam>[^/]+?)/(?<nxtPlocale>[^/]+?)/posts/(?<nxtPid>[^/]+?)(?<rscSuffix>\\.rsc|\\.segments/.+\\.segment\\.rsc|)(?:/)?$
       -> /[team]/[locale]/posts/[id]$rscSuffix?nxtPteam=$nxtPteam&nxtPlocale=$nxtPlocale&nxtPid=$nxtPid"
    `)
  })
})
