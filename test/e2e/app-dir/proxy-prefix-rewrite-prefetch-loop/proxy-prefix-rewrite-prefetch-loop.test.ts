import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { createRouterAct } from 'router-act'
import type { Page, Request } from 'playwright'

const NEXT_ROUTER_STATE_TREE_HEADER = 'next-router-state-tree'

// The proxy rewrites every request to `/en/...`, so `locale` is always "en".
// A request whose state tree binds `locale` to anything else matched the
// `/[locale]/[...pages]` pattern without accounting for the injected segment.
const MISPREDICTED_TREE_PATTERN = /"locale","(?!en")/

function decodeStateTree(value: string | undefined): string | null {
  if (value === undefined) {
    return null
  }
  // The header is sent percent-encoded.
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

describe('proxy-prefix-rewrite-prefetch-loop', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev) {
    // Only reproduces in a production build; dev does not predict routes from
    // a learned pattern (it resolves routes on demand).
    test('skipped in dev mode', () => {})
    return
  }

  it('does not prefetch an ancestor link in a loop when the proxy injects a path segment', async () => {
    let act: ReturnType<typeof createRouterAct>

    // Every router request must carry a state tree with the server-resolved
    // locale ("en"). Pre-fix, revealing a link that fully matched the learned
    // pattern issued a prefetch with a mispredicted tree (locale bound to
    // "one") that the server could never satisfy, so the prefetch task
    // retried it in a tight serial loop. Under that loop, `act`'s flush keeps
    // observing new requests and never settles — so instead of waiting for a
    // jest timeout, we race each `act` against a promise that rejects as soon
    // as the first mispredicted request is observed. This fails fast with a
    // legible error on a buggy build and is a no-op on a correct one.
    const mispredictedTrees: string[] = []
    let rejectOnMisprediction!: (error: Error) => void
    const mispredictionDetected = new Promise<never>((_, reject) => {
      rejectOnMisprediction = reject
    })
    // Mark the rejection as handled in case it fires while no race is
    // pending; the final assertion on `mispredictedTrees` still catches it.
    mispredictionDetected.catch(() => {})

    async function actExpectingNoMisprediction<T>(
      scope: () => Promise<T> | T,
      config?: Parameters<typeof act>[1]
    ): Promise<unknown> {
      const actPromise = act(scope, config)
      // If the race rejects first, `act` keeps running until the page is torn
      // down; swallow its eventual rejection so it doesn't surface as an
      // unhandled promise rejection.
      actPromise.catch(() => {})
      return Promise.race([actPromise, mispredictionDetected])
    }

    const browser = await next.browser('/one/two/three/four', {
      beforePageLoad(page: Page) {
        act = createRouterAct(page)
        page.on('request', (request: Request) => {
          const headers = request.headers()
          if (headers['rsc'] === undefined) {
            return
          }
          const stateTree = decodeStateTree(
            headers[NEXT_ROUTER_STATE_TREE_HEADER]
          )
          if (stateTree !== null && MISPREDICTED_TREE_PATTERN.test(stateTree)) {
            mispredictedTrees.push(stateTree)
            rejectOnMisprediction(
              new Error(
                'Observed a router request whose next-router-state-tree ' +
                  'binds `locale` to a value other than "en". The proxy ' +
                  'rewrites every path to /en/..., so the server can never ' +
                  'satisfy this tree; a client that issues it predicted the ' +
                  'route without accounting for the injected segment.\n\n' +
                  `State tree: ${stateTree}`
              )
            )
          }
        })
      },
    })

    // The initial page load renders the proxied route (`/en/one/two/three/
    // four`) and is when the client learns (or, with the fix, declines to
    // learn) the `/[locale]/[...pages]` pattern for `/one/two/three/four`.
    expect(await browser.elementById('params').text()).toBe(
      'params:en:one/two/three/four:end'
    )

    // Reveal the `/one/two` link. It is the first ancestor with enough URL
    // parts to fully match the learned pattern (2 parts = [locale] + at least
    // one for [...pages]). The client must not predict the route from the
    // pattern; it must ask the server instead, via a route tree (`/_tree`)
    // prefetch — asserted by matching the route trie shape in a static
    // prefetch response. Pre-fix, no `/_tree` request happens at all: the
    // pattern fully matches, so the client predicts the route and issues the
    // mispredicted runtime prefetch that loops forever; the race above turns
    // that into a fast, descriptive failure. `act` returning at all also
    // proves the prefetch queue settled instead of looping.
    await actExpectingNoMisprediction(
      async () => {
        const toggle = await browser.elementByCss(
          'input[data-link-accordion="/one/two"]'
        )
        await toggle.click()
      },
      { includes: '"n":"pages"', kind: 'static' }
    )

    // Navigate to the prefetched ancestor. The navigation response must
    // contain content rendered with the server-resolved params (locale "en",
    // pages ["one", "two"]) — proving the request tree wasn't shaped by a
    // mispredicted binding of locale to "one".
    await actExpectingNoMisprediction(
      async () => {
        const link = await browser.elementByCss('a[href="/one/two"]')
        await link.click()
      },
      { includes: 'params:en:one/two:end' }
    )

    // Both the old and new page render `#params`, so wait for the soft
    // navigation to commit the new content.
    await retry(async () => {
      expect(await browser.elementById('params').text()).toBe(
        'params:en:one/two:end'
      )
    })

    // The sharpest signal of the bug: no request during the entire test ever
    // carried a mispredicted state tree.
    expect(mispredictedTrees).toEqual([])
  })
})
