import type { Prefetch } from '../../../build/segment-config/app/app-segment-config'
import type { LoaderTree } from '../../lib/app-dir-module'
import { isPartialPrefetchingEnabledForRoute } from './instant-config'

function createTree(
  prefetch?: Prefetch,
  parallelRoutes: LoaderTree[1] = {}
): LoaderTree {
  const mod = prefetch === undefined ? {} : { prefetch }

  return [
    'segment',
    parallelRoutes,
    { page: [async () => mod, 'page.tsx'] },
    null,
  ]
}

describe('isPartialPrefetchingEnabledForRoute', () => {
  it('uses the app default when no segment has an explicit config', async () => {
    const tree = createTree(undefined, {
      children: createTree(),
    })

    await expect(isPartialPrefetchingEnabledForRoute(tree, true)).resolves.toBe(
      true
    )
    await expect(
      isPartialPrefetchingEnabledForRoute(tree, false)
    ).resolves.toBe(false)
  })

  it('allows a segment to opt in over a disabled app default', async () => {
    const tree = createTree(undefined, {
      children: createTree('partial'),
    })

    await expect(
      isPartialPrefetchingEnabledForRoute(tree, false)
    ).resolves.toBe(true)
  })

  it('allows force-disabled to opt out of an enabled app default', async () => {
    const tree = createTree(undefined, {
      children: createTree('force-disabled'),
    })

    await expect(isPartialPrefetchingEnabledForRoute(tree, true)).resolves.toBe(
      false
    )
  })

  it('treats an explicit auto config as an override of the app default', async () => {
    const tree = createTree(undefined, {
      children: createTree('auto'),
    })

    await expect(isPartialPrefetchingEnabledForRoute(tree, true)).resolves.toBe(
      false
    )
  })

  it('preserves a partial opt-in above a force-disabled descendant', async () => {
    const tree = createTree('partial', {
      children: createTree('force-disabled'),
    })

    await expect(
      isPartialPrefetchingEnabledForRoute(tree, false)
    ).resolves.toBe(true)
  })

  it('gives an explicit partial opt-in precedence over other segment overrides', async () => {
    const tree = createTree(undefined, {
      children: createTree('force-disabled'),
      slot: createTree('partial'),
    })

    await expect(isPartialPrefetchingEnabledForRoute(tree, true)).resolves.toBe(
      true
    )
  })
})
