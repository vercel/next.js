import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

type ProbeState = {
  label: string
  hidden: boolean
  segmentParams: Record<string, string>
  params: Record<string, string>
  pathname: string
}

// With Cache Components, every layout slot keeps up to 3 recently active
// segments mounted, the inactive ones inside `<Activity mode="hidden">`.
// These tests document what `useParams()` and `usePathname()` return inside
// those hidden trees.
//
// Today, the hooks read router-wide contexts, so hidden trees re-render and
// commit with the active route's values, while the segment's own params (from
// the server) still describe the hidden route. They should probably reflect
// the navigation state of the hidden route instead (`params` equal to
// `segmentParams`, `pathname` equal to the URL the route was last shown at).
describe('router-hooks-hidden-routes', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  async function readProbes(
    browser: Awaited<ReturnType<typeof next.browser>>
  ): Promise<ProbeState[]> {
    const probes: ProbeState[] = await browser.eval(() =>
      Array.from(document.querySelectorAll<HTMLElement>('[data-probe]')).map(
        (el) => ({
          label: el.dataset.probe!,
          hidden: !el.checkVisibility(),
          segmentParams: JSON.parse(el.dataset.segmentParams!),
          params: JSON.parse(el.dataset.params!),
          pathname: el.dataset.pathname!,
        })
      )
    )
    const key = (p: ProbeState) =>
      `${p.hidden}:${p.label}:${JSON.stringify(p.segmentParams)}`
    return probes.sort((a, b) => key(a).localeCompare(key(b)))
  }

  it('hidden routes see the active route params and pathname', async () => {
    const browser = await next.browser('/acme/a')

    // /acme/a → /acme/b: the team layout stays visible, and project page `a`
    // is hidden in the team layout's `children` slot.
    await browser.elementByCss('a[href="/acme/b"]').click()
    await retry(async () => {
      expect(await readProbes(browser)).toEqual([
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

    // /acme/b → /account: the whole `[team]` subtree is hidden in the root
    // slot, including the project pages hidden inside it.
    await browser.elementByCss('a[href="/account"]').click()
    await retry(async () => {
      expect(await readProbes(browser)).toEqual([
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

    // Back to /acme/b: the team subtree is visible again, and the account page
    // is now hidden.
    await browser.back()
    await retry(async () => {
      expect(await readProbes(browser)).toEqual([
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
  })
})
