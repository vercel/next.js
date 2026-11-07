import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

type ProbeState = {
  label: string
  hidden: boolean
  segmentParams: Record<string, string>
  params: Record<string, string>
  pathname: string
  calls: number
  renders: number
}

// With Cache Components, every layout slot keeps up to 3 recently active
// segments mounted, the inactive ones inside `<Activity mode="hidden">`.
// These tests document what `useParams()` and `usePathname()` return inside
// those hidden trees, and which trees re-render on each navigation.
//
// Today, the hooks read router-wide contexts, so hidden trees re-render and
// commit with the active route's values, while the segment's own params (from
// the server) still describe the hidden route. They should probably reflect
// the navigation state of the hidden route instead (`params` equal to
// `segmentParams`, `pathname` equal to the URL the route was last shown at),
// and hidden trees should not re-render.
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

  it('hidden routes see the active route params and pathname', async () => {
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
        },
        {
          label: 'team-layout',
          hidden: false,
          segmentParams: { team: 'acme' },
          params: { team: 'acme', project: 'b' },
          pathname: '/acme/b',
        },
        {
          label: 'project-page',
          hidden: true,
          segmentParams: { team: 'acme', project: 'a' },
          // TODO: should be { team: 'acme', project: 'a' } and '/acme/a'.
          params: { team: 'acme', project: 'b' },
          pathname: '/acme/b',
        },
      ])
    })
    await waitForIdle(browser)
    const onB = await readProbes(browser)
    expect(rerendered(initial, onB)).toEqual({
      'team-layout acme': 'render',
      // TODO: hidden, should not re-render.
      'project-page acme/a': 'render',
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
        },
        {
          label: 'project-page',
          hidden: true,
          segmentParams: { team: 'acme', project: 'a' },
          // TODO: should be { team: 'acme', project: 'a' } and '/acme/a'.
          params: {},
          pathname: '/account',
        },
        {
          label: 'project-page',
          hidden: true,
          segmentParams: { team: 'acme', project: 'b' },
          // TODO: should be { team: 'acme', project: 'b' } and '/acme/b'.
          params: {},
          pathname: '/account',
        },
        {
          label: 'team-layout',
          hidden: true,
          segmentParams: { team: 'acme' },
          // TODO: should be { team: 'acme', project: 'b' } and '/acme/b'.
          params: {},
          pathname: '/account',
        },
      ])
    })
    await waitForIdle(browser)
    const onAccount = await readProbes(browser)
    expect(rerendered(onB, onAccount)).toEqual({
      // TODO: hidden, should not re-render.
      'team-layout acme': 'render',
      'project-page acme/a': 'render',
      'project-page acme/b': 'render',
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
        },
        {
          label: 'team-layout',
          hidden: false,
          segmentParams: { team: 'acme' },
          params: { team: 'acme', project: 'b' },
          pathname: '/acme/b',
        },
        {
          label: 'account-page',
          hidden: true,
          segmentParams: {},
          // TODO: should be {} and '/account'.
          params: { team: 'acme', project: 'b' },
          pathname: '/acme/b',
        },
        {
          label: 'project-page',
          hidden: true,
          segmentParams: { team: 'acme', project: 'a' },
          // TODO: should be { team: 'acme', project: 'a' } and '/acme/a'.
          params: { team: 'acme', project: 'b' },
          pathname: '/acme/b',
        },
      ])
    })
    await waitForIdle(browser)
    const backOnB = await readProbes(browser)
    expect(rerendered(onAccount, backOnB)).toEqual({
      // TODO: the account page is hidden, and the team subtree shows the same
      // values as when it was hidden. None of these should re-render.
      'account-page': 'render',
      'team-layout acme': 'render',
      'project-page acme/a': 'render',
      'project-page acme/b': 'render',
    })
  })
})
