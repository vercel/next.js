import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// Declared by the fixture's `components/probe.tsx`, which the root tsconfig
// doesn't include; the test reads the same global in the browser.
declare global {
  interface Window {
    __probeCounts?: Record<string, { calls: number; renders: number }>
  }
}

type ProbeState = {
  label: string
  hidden: boolean
  segmentParams: Record<string, string>
  params: Record<string, string>
  pathname: string
  search: string
  calls: number
  renders: number
}

// With Cache Components, every layout slot keeps up to 3 recently active
// segments mounted, the inactive ones inside `<Activity mode="hidden">`.
// Inside a hidden tree, `useParams()`, `usePathname()` and `useSearchParams()`
// return the values the tree had when it was hidden. So hidden trees don't
// re-render when the active route changes. A tree that is shown again gets the
// current values: it doesn't re-render if they are the ones it was hidden
// with, and it re-renders if they differ, for example in the search params.
//
// React still calls hidden components that read these hooks when the router's
// values change, because it propagates a context change to every consumer
// below the changed provider, including below a nested provider with an
// unchanged value. They read unchanged values and bail out ('bailout').
describe('router-hooks-hidden-routes', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  type Browser = Awaited<ReturnType<typeof next.browser>>

  async function readProbes(browser: Browser): Promise<ProbeState[]> {
    const probes: ProbeState[] = await browser.eval(() =>
      Array.from(document.querySelectorAll<HTMLElement>('[data-probe]')).map(
        (el) => ({
          label: el.dataset.probe!,
          hidden: !el.checkVisibility(),
          segmentParams: JSON.parse(el.dataset.segmentParams!),
          params: JSON.parse(el.dataset.params!),
          pathname: el.dataset.pathname!,
          search: el.dataset.search!,
          ...(window.__probeCounts?.[
            `${el.dataset.probe}:${el.dataset.segmentParams}`
          ] ?? { calls: 0, renders: 0 }),
        })
      )
    )
    const key = (p: ProbeState) =>
      `${p.hidden}:${p.label}:${JSON.stringify(p.segmentParams)}`
    return probes.sort((a, b) => key(a).localeCompare(key(b)))
  }

  // Probes without their counts, for comparing the rendered values.
  async function readValues(browser: Browser) {
    return (await readProbes(browser)).map(
      ({ calls, renders, ...rest }) => rest
    )
  }

  // Hidden trees render at the lowest priority. Wait for the browser to be idle
  // so that pending hidden renders have finished before counts are compared.
  async function waitForIdle(browser: Browser) {
    for (let i = 0; i < 2; i++) {
      await browser.eval(
        () => new Promise((resolve) => requestIdleCallback(resolve))
      )
    }
  }

  function probeName(p: ProbeState) {
    return `${p.label} ${Object.values(p.segmentParams).join('/')}`.trim()
  }

  // For each probe that existed before and after a navigation, what React did
  // with it in between:
  // - 'none': not called.
  // - 'bailout': called, but the values it read were unchanged, so React
  //   discarded the result and didn't render its children.
  // - 'render': re-rendered.
  // Probes that mounted during the navigation are left out.
  function rerendered(before: ProbeState[], after: ProbeState[]) {
    const result: Record<string, 'none' | 'bailout' | 'render'> = {}
    for (const p of after) {
      const prev = before.find((b) => probeName(b) === probeName(p))
      if (prev) {
        result[probeName(p)] =
          p.renders > prev.renders
            ? 'render'
            : p.calls > prev.calls
              ? 'bailout'
              : 'none'
      }
    }
    return result
  }

  it('hidden routes keep the params and pathname they were hidden with', async () => {
    const browser = await next.browser('/acme/a')
    await waitForIdle(browser)
    const initial = await readProbes(browser)

    // /acme/a → /acme/b: the team layout stays visible, and project page `a`
    // is hidden in the team layout's `children` slot.
    await browser.elementByCss('a[href="/acme/b"]').click()
    await retry(async () => {
      expect(await readValues(browser)).toEqual([
        {
          label: 'project-page',
          hidden: false,
          segmentParams: { team: 'acme', project: 'b' },
          params: { team: 'acme', project: 'b' },
          pathname: '/acme/b',
          search: '',
        },
        {
          label: 'team-layout',
          hidden: false,
          segmentParams: { team: 'acme' },
          params: { team: 'acme', project: 'b' },
          pathname: '/acme/b',
          search: '',
        },
        {
          label: 'project-page',
          hidden: true,
          segmentParams: { team: 'acme', project: 'a' },
          params: { team: 'acme', project: 'a' },
          pathname: '/acme/a',
          search: '',
        },
      ])
    })
    await waitForIdle(browser)
    let onB: ProbeState[] = []
    await retry(async () => {
      onB = await readProbes(browser)
      expect(rerendered(initial, onB)).toEqual({
        // Visible, and its params changed.
        'team-layout acme': 'render',
        'project-page acme/a': 'bailout',
      })
    })

    // /acme/b → /account: the whole `[team]` subtree is hidden in the root
    // slot, including the project pages hidden inside it.
    await browser.elementByCss('a[href="/account"]').click()
    await retry(async () => {
      expect(await readValues(browser)).toEqual([
        {
          label: 'account-page',
          hidden: false,
          segmentParams: {},
          params: {},
          pathname: '/account',
          search: '',
        },
        {
          label: 'project-page',
          hidden: true,
          segmentParams: { team: 'acme', project: 'a' },
          params: { team: 'acme', project: 'a' },
          pathname: '/acme/a',
          search: '',
        },
        {
          label: 'project-page',
          hidden: true,
          segmentParams: { team: 'acme', project: 'b' },
          params: { team: 'acme', project: 'b' },
          pathname: '/acme/b',
          search: '',
        },
        {
          label: 'team-layout',
          hidden: true,
          segmentParams: { team: 'acme' },
          params: { team: 'acme', project: 'b' },
          pathname: '/acme/b',
          search: '',
        },
      ])
    })
    await waitForIdle(browser)
    let onAccount: ProbeState[] = []
    await retry(async () => {
      onAccount = await readProbes(browser)
      expect(rerendered(onB, onAccount)).toEqual({
        'team-layout acme': 'bailout',
        'project-page acme/a': 'bailout',
        'project-page acme/b': 'bailout',
      })
    })

    // Back to /acme/b: the team subtree is visible again, and the account page
    // is now hidden.
    await browser.back()
    await retry(async () => {
      expect(await readValues(browser)).toEqual([
        {
          label: 'project-page',
          hidden: false,
          segmentParams: { team: 'acme', project: 'b' },
          params: { team: 'acme', project: 'b' },
          pathname: '/acme/b',
          search: '',
        },
        {
          label: 'team-layout',
          hidden: false,
          segmentParams: { team: 'acme' },
          params: { team: 'acme', project: 'b' },
          pathname: '/acme/b',
          search: '',
        },
        {
          label: 'account-page',
          hidden: true,
          segmentParams: {},
          params: {},
          pathname: '/account',
          search: '',
        },
        {
          label: 'project-page',
          hidden: true,
          segmentParams: { team: 'acme', project: 'a' },
          params: { team: 'acme', project: 'a' },
          pathname: '/acme/a',
          search: '',
        },
      ])
    })
    await waitForIdle(browser)
    let backOnB: ProbeState[] = []
    await retry(async () => {
      backOnB = await readProbes(browser)
      expect(rerendered(onAccount, backOnB)).toEqual({
        'account-page': 'bailout',
        // Shown again with the values it was hidden with.
        'team-layout acme': 'bailout',
        'project-page acme/a': 'bailout',
        'project-page acme/b': 'bailout',
      })
    })

    // /acme/b → /acme/a?x=1: project page `a` is shown again, but with
    // different search params than it was hidden with, so it re-renders.
    await browser.elementByCss('a[href="/acme/a?x=1"]').click()
    await retry(async () => {
      expect(await readValues(browser)).toEqual([
        {
          label: 'project-page',
          hidden: false,
          segmentParams: { team: 'acme', project: 'a' },
          params: { team: 'acme', project: 'a' },
          pathname: '/acme/a',
          search: 'x=1',
        },
        {
          label: 'team-layout',
          hidden: false,
          segmentParams: { team: 'acme' },
          params: { team: 'acme', project: 'a' },
          pathname: '/acme/a',
          search: 'x=1',
        },
        {
          label: 'account-page',
          hidden: true,
          segmentParams: {},
          params: {},
          pathname: '/account',
          search: '',
        },
        {
          label: 'project-page',
          hidden: true,
          segmentParams: { team: 'acme', project: 'b' },
          params: { team: 'acme', project: 'b' },
          pathname: '/acme/b',
          search: '',
        },
      ])
    })
    await waitForIdle(browser)
    let onAWithSearch: ProbeState[] = []
    await retry(async () => {
      onAWithSearch = await readProbes(browser)
      expect(rerendered(backOnB, onAWithSearch)).toEqual({
        // Shown again with different values.
        'project-page acme/a': 'render',
        'team-layout acme': 'render',
        'account-page': 'bailout',
        'project-page acme/b': 'bailout',
      })
    })

    // Back to /acme/b: project page `a` is hidden with its search params, and
    // `b` is shown again with the values it was hidden with. (A link click
    // would refetch the page in dev and re-render it with new elements.)
    await browser.back()
    await retry(async () => {
      expect(await readValues(browser)).toEqual([
        {
          label: 'project-page',
          hidden: false,
          segmentParams: { team: 'acme', project: 'b' },
          params: { team: 'acme', project: 'b' },
          pathname: '/acme/b',
          search: '',
        },
        {
          label: 'team-layout',
          hidden: false,
          segmentParams: { team: 'acme' },
          params: { team: 'acme', project: 'b' },
          pathname: '/acme/b',
          search: '',
        },
        {
          label: 'account-page',
          hidden: true,
          segmentParams: {},
          params: {},
          pathname: '/account',
          search: '',
        },
        {
          label: 'project-page',
          hidden: true,
          segmentParams: { team: 'acme', project: 'a' },
          params: { team: 'acme', project: 'a' },
          pathname: '/acme/a',
          search: 'x=1',
        },
      ])
    })
    await waitForIdle(browser)
    await retry(async () => {
      expect(rerendered(onAWithSearch, await readProbes(browser))).toEqual({
        'project-page acme/b': 'bailout',
        'team-layout acme': 'render',
        'account-page': 'bailout',
        'project-page acme/a': 'bailout',
      })
    })
  })

  // The visible throwers (`thrower:<project>:<action>`) and boundary fallbacks
  // (`boundary:<name>`).
  async function readBoundaryMarkers(browser: Browser): Promise<string[]> {
    const markers: string[] = await browser.eval(() =>
      Array.from(
        document.querySelectorAll<HTMLElement>('[data-thrower],[data-boundary]')
      )
        .filter((el) => el.checkVisibility())
        .map((el) =>
          el.dataset.thrower !== undefined
            ? `thrower:${el.dataset.thrower}`
            : `boundary:${el.dataset.boundary}`
        )
    )
    return markers.sort()
  }

  const actions = ['error', 'not-found', 'catch-error']

  function throwers(project: string) {
    return actions.map((action) => `thrower:${project}:${action}`).sort()
  }

  // `error.js`, `not-found.js` and `catchError()` boundaries reset when the
  // pathname changes. The pathname of a hidden route doesn't change, and it is
  // the same again when navigating back to the route, so the boundaries also
  // reset when their route is shown again.
  describe.each([
    {
      away: '/acme/b',
      hides: 'the project page',
      awayMarkers: throwers('b'),
    },
    {
      away: '/account',
      hides: 'the team layout',
      awayMarkers: [],
    },
  ])('navigating to $away, which hides $hides', ({ away, awayMarkers }) => {
    it.each([
      { action: 'error', fallback: ['boundary:error'] },
      { action: 'not-found', fallback: ['boundary:not-found'] },
      {
        action: 'catch-error',
        // `catchError()` only replaces its own children.
        fallback: [
          'boundary:catch-error',
          'thrower:a:error',
          'thrower:a:not-found',
        ],
      },
    ])('resets the $action boundary', async ({ action, fallback }) => {
      const browser = await next.browser('/acme/a')
      await waitForIdle(browser)
      expect(await readBoundaryMarkers(browser)).toEqual(throwers('a'))

      await browser.elementByCss(`[data-thrower="a:${action}"]`).click()
      await retry(async () => {
        expect(await readBoundaryMarkers(browser)).toEqual(fallback)
      })

      await browser.elementByCss(`a[href="${away}"]`).click()
      await retry(async () => {
        expect(new URL(await browser.url()).pathname).toBe(away)
        expect(await readBoundaryMarkers(browser)).toEqual(awayMarkers)
      })
      // Let the hidden route render, so that it knows it was hidden.
      await waitForIdle(browser)

      await browser.elementByCss('a[href="/acme/a"]').click()
      await retry(async () => {
        expect(new URL(await browser.url()).pathname).toBe('/acme/a')
        expect(await readBoundaryMarkers(browser)).toEqual(throwers('a'))
      })
    })
  })
})
