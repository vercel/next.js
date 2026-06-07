import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

function findRefetchPaths(
  tree: [unknown, Record<string, any>, unknown, unknown],
  path: string[] = []
): string[][] {
  const paths = tree[3] === 'refetch' ? [path] : []
  for (const [parallelRouteKey, child] of Object.entries(tree[1])) {
    paths.push(...findRefetchPaths(child, [...path, parallelRouteKey]))
  }
  return paths
}

describe('targeted-hmr-refresh', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('targets the smallest subtree containing the changed owners', async () => {
    const browser = await next.browser('/acme/dashboard')

    await browser.eval(() => {
      const originalFetch = window.fetch
      ;(window as any).__hmrRequestTrees = []
      window.fetch = async (input, init) => {
        const headers = new Headers(
          input instanceof Request ? input.headers : undefined
        )
        new Headers(init?.headers).forEach((value, key) => {
          headers.set(key, value)
        })
        if (headers.get('next-hmr-refresh') === '1') {
          const encodedTree = headers.get('next-router-state-tree')
          if (encodedTree !== null) {
            ;(window as any).__hmrRequestTrees.push(
              JSON.parse(decodeURIComponent(encodedTree))
            )
          }
        }
        return originalFetch(input, init)
      }
    })

    async function expectRefetchPaths(expected: string[][]) {
      const requestTrees = await browser.eval(() => {
        const trees = (window as any).__hmrRequestTrees
        ;(window as any).__hmrRequestTrees = []
        return trees
      })
      expect(requestTrees).toHaveLength(1)
      expect(findRefetchPaths(requestTrees[0])).toEqual(expected)
    }

    await next.patchFile('app/[team]/dashboard/(content)/page.tsx', (source) =>
      source.replace('page-initial', 'page-updated')
    )
    await retry(async () => {
      expect(await browser.elementById('page-marker').text()).toBe(
        'page-updated'
      )
    })
    await expectRefetchPaths([['children', 'children', 'children', 'children']])

    await next.patchFile('app/[team]/dashboard/layout.tsx', (source) =>
      source.replace('dashboard-layout-initial', 'dashboard-layout-updated')
    )
    await retry(async () => {
      expect(await browser.elementById('dashboard-layout-marker').text()).toBe(
        'dashboard-layout-updated'
      )
    })
    await expectRefetchPaths([['children', 'children']])

    await next.patchFile('app/@sidebar/default.tsx', (source) =>
      source.replace('sidebar-initial', 'sidebar-updated')
    )
    await retry(async () => {
      expect(await browser.elementById('sidebar-marker').text()).toBe(
        'sidebar-updated'
      )
    })
    await expectRefetchPaths([['sidebar']])

    await next.patchFile('app/layout.tsx', (source) =>
      source.replace('root-layout-initial', 'root-layout-updated')
    )
    await retry(async () => {
      expect(await browser.elementById('root-layout-marker').text()).toBe(
        'root-layout-updated'
      )
    })
    await expectRefetchPaths([[]])

    await next.patchFile(
      'app/[team]/dashboard/(content)/shared.tsx',
      (source) => source.replace('shared-initial', 'shared-updated')
    )
    await retry(async () => {
      expect(await browser.elementById('shared-marker').text()).toBe(
        'shared-updated'
      )
    })
    await expectRefetchPaths([['children', 'children', 'children', 'children']])

    await next.patchFile('app/[team]/dashboard/shared-owner.tsx', (source) =>
      source.replace('shared-owner-initial', 'shared-owner-updated')
    )
    await retry(async () => {
      expect(
        await browser.elementById('layout-shared-owner-marker').text()
      ).toBe('shared-owner-updated')
      expect(await browser.elementById('page-shared-owner-marker').text()).toBe(
        'shared-owner-updated'
      )
    })
    await expectRefetchPaths([['children', 'children']])

    await Promise.all([
      next.patchFile('app/[team]/dashboard/(content)/page.tsx', (source) =>
        source.replace('page-updated', 'page-multi-updated')
      ),
      next.patchFile('app/[team]/dashboard/layout.tsx', (source) =>
        source.replace('dashboard-layout-updated', 'layout-multi-updated')
      ),
    ])
    await retry(async () => {
      expect(await browser.elementById('page-marker').text()).toBe(
        'page-multi-updated'
      )
      expect(await browser.elementById('dashboard-layout-marker').text()).toBe(
        'layout-multi-updated'
      )
    })
    await expectRefetchPaths([['children', 'children']])
  })
})
