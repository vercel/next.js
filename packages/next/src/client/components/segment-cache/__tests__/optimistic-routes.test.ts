import {
  reifyRouteTree,
  discoverKnownRoute,
  matchKnownRoute,
  resetKnownRoutes,
  type ReifyAccumulator,
  type ResolvedParams,
} from '../optimistic-routes'
import {
  type RouteTree,
  type RootRouteTree,
  createRootRouteTree,
} from '../cache'
import {
  type SegmentRequestKey,
  ROOT_SEGMENT_REQUEST_KEY,
} from '../../../../shared/lib/segment-cache/segment-value-encoding'
import { PAGE_SEGMENT_KEY } from '../../../../shared/lib/segment'
import {
  finalizeVaryPath,
  getShellSegmentVaryPath,
  type PartialVaryPath,
} from '../vary-path'
import type { NormalizedSearch } from '../cache-key'
import type { DynamicParamTypesShort } from '../../../../shared/lib/app-router-types'

const EMPTY_SEARCH = '' as NormalizedSearch

function createMockPageNode(
  requestKey: SegmentRequestKey,
  partialVaryPath: PartialVaryPath | null
): RouteTree<null> {
  const varyPath = finalizeVaryPath(requestKey, EMPTY_SEARCH, partialVaryPath)
  return {
    requestKey,
    segment: PAGE_SEGMENT_KEY,
    varyPath,
    shellVaryPath: getShellSegmentVaryPath(varyPath),
    refreshState: null,
    data: null,
    slots: null,
    prefetchHints: 0,
  }
}

function createMockDynamicNode(
  requestKey: SegmentRequestKey,
  paramName: string,
  paramType: DynamicParamTypesShort,
  slots: Map<string, RouteTree<null>> | null,
  partialVaryPath: PartialVaryPath | null
): RouteTree<null> {
  const varyPath = finalizeVaryPath(requestKey, null, partialVaryPath)
  return {
    requestKey,
    segment: [paramName, '', paramType, null],
    varyPath,
    shellVaryPath: getShellSegmentVaryPath(varyPath),
    refreshState: null,
    data: null,
    slots,
    prefetchHints: 0,
  }
}

function createMockStaticNode(
  requestKey: SegmentRequestKey,
  segmentName: string,
  slots: Map<string, RouteTree<null>> | null,
  partialVaryPath: PartialVaryPath | null
): RouteTree<null> {
  const varyPath = finalizeVaryPath(requestKey, null, partialVaryPath)
  return {
    requestKey,
    segment: segmentName,
    varyPath,
    shellVaryPath: getShellSegmentVaryPath(varyPath),
    refreshState: null,
    data: null,
    slots,
    prefetchHints: 0,
  }
}

describe('optimistic-routes', () => {
  beforeEach(() => {
    resetKnownRoutes()
  })

  describe('reifyRouteTree', () => {
    it('returns null when a dynamic segment param is missing from resolvedParams', () => {
      const pageNode = createMockPageNode(
        '/blog/$d$slug/__PAGE__' as SegmentRequestKey,
        null
      )
      const slots = new Map<string, RouteTree<null>>([['children', pageNode]])
      const dynamicNode = createMockDynamicNode(
        '/blog/$d$slug' as SegmentRequestKey,
        'slug',
        'd',
        slots,
        null
      )

      const resolvedParams: ResolvedParams = new Map() // 'slug' is missing
      const acc: ReifyAccumulator = { metadataVaryPath: null }

      const result = reifyRouteTree(
        dynamicNode,
        resolvedParams,
        EMPTY_SEARCH,
        null,
        acc
      )
      expect(result).toBeNull()
    })

    it('returns null when a parallel slot contains an unresolved dynamic catch-all param', () => {
      // Shape representing:
      // Layout
      //   slots:
      //     children: items (static) -> [itemId] (dynamic) -> page
      //     @modal: [...catchAll] (catch-all) -> page
      const modalPageNode = createMockPageNode(
        '/@modal/$c$catchAll/__PAGE__' as SegmentRequestKey,
        null
      )
      const modalCatchAllNode = createMockDynamicNode(
        '/@modal/$c$catchAll' as SegmentRequestKey,
        'catchAll',
        'c',
        new Map([['children', modalPageNode]]),
        null
      )

      const childrenPageNode = createMockPageNode(
        '/children/items/$d$itemId/__PAGE__' as SegmentRequestKey,
        null
      )
      const itemIdNode = createMockDynamicNode(
        '/children/items/$d$itemId' as SegmentRequestKey,
        'itemId',
        'd',
        new Map([['children', childrenPageNode]]),
        null
      )
      const itemsNode = createMockStaticNode(
        '/children/items' as SegmentRequestKey,
        'items',
        new Map([['children', itemIdNode]]),
        null
      )

      const rootLayoutNode = createMockStaticNode(
        ROOT_SEGMENT_REQUEST_KEY,
        '',
        new Map([
          ['children', itemsNode],
          ['modal', modalCatchAllNode],
        ]),
        null
      )

      // Only 'itemId' is resolved, 'catchAll' was not resolved during URL matching
      const resolvedParams: ResolvedParams = new Map([['itemId', 'item-42']])
      const acc: ReifyAccumulator = { metadataVaryPath: null }

      const result = reifyRouteTree(
        rootLayoutNode,
        resolvedParams,
        EMPTY_SEARCH,
        null,
        acc
      )
      expect(result).toBeNull()
    })

    it('successfully reifies when all dynamic parameters are resolved', () => {
      const pageNode = createMockPageNode(
        '/blog/$d$slug/__PAGE__' as SegmentRequestKey,
        null
      )
      const slots = new Map<string, RouteTree<null>>([['children', pageNode]])
      const dynamicNode = createMockDynamicNode(
        '/blog/$d$slug' as SegmentRequestKey,
        'slug',
        'd',
        slots,
        null
      )

      const resolvedParams: ResolvedParams = new Map([['slug', 'hello-world']])
      const acc: ReifyAccumulator = { metadataVaryPath: null }

      const result = reifyRouteTree(
        dynamicNode,
        resolvedParams,
        EMPTY_SEARCH,
        null,
        acc
      )
      expect(result).not.toBeNull()
      expect(result?.segment).toEqual(['slug', 'hello-world', 'd', null])
    })
  })

  describe('matchKnownRoute with parallel slot catch-all', () => {
    it('returns null instead of predicting a broken tree when parallel slot catch-all is unresolved', () => {
      // Build a server response tree for /acme/items/1/view:
      // root (segment: '')
      //   slots:
      //     children: [workspace] ->
      //       slots:
      //         children: items -> [itemId] -> view -> __PAGE__
      //         modal: [...catchAll] -> __PAGE__
      const modalPageNode: RouteTree<null> = {
        requestKey: '/@modal/$c$catchAll/__PAGE__' as SegmentRequestKey,
        segment: PAGE_SEGMENT_KEY,
        varyPath: finalizeVaryPath(
          '/@modal/$c$catchAll/__PAGE__' as SegmentRequestKey,
          EMPTY_SEARCH,
          null
        ),
        shellVaryPath: getShellSegmentVaryPath(
          finalizeVaryPath(
            '/@modal/$c$catchAll/__PAGE__' as SegmentRequestKey,
            EMPTY_SEARCH,
            null
          )
        ),
        refreshState: null,
        data: null,
        slots: null,
        prefetchHints: 0,
      }

      const modalCatchAllNode: RouteTree<null> = {
        requestKey: '/@modal/$c$catchAll' as SegmentRequestKey,
        segment: ['catchAll', 'items/1/view', 'c', null],
        varyPath: finalizeVaryPath(
          '/@modal/$c$catchAll' as SegmentRequestKey,
          null,
          null
        ),
        shellVaryPath: getShellSegmentVaryPath(
          finalizeVaryPath(
            '/@modal/$c$catchAll' as SegmentRequestKey,
            null,
            null
          )
        ),
        refreshState: null,
        data: null,
        slots: new Map([['children', modalPageNode]]),
        prefetchHints: 0,
      }

      const viewPageNode: RouteTree<null> = {
        requestKey:
          '/$d$workspace/items/$d$itemId/view/__PAGE__' as SegmentRequestKey,
        segment: PAGE_SEGMENT_KEY,
        varyPath: finalizeVaryPath(
          '/$d$workspace/items/$d$itemId/view/__PAGE__' as SegmentRequestKey,
          EMPTY_SEARCH,
          null
        ),
        shellVaryPath: getShellSegmentVaryPath(
          finalizeVaryPath(
            '/$d$workspace/items/$d$itemId/view/__PAGE__' as SegmentRequestKey,
            EMPTY_SEARCH,
            null
          )
        ),
        refreshState: null,
        data: null,
        slots: null,
        prefetchHints: 0,
      }

      const viewNode: RouteTree<null> = {
        requestKey: '/$d$workspace/items/$d$itemId/view' as SegmentRequestKey,
        segment: 'view',
        varyPath: finalizeVaryPath(
          '/$d$workspace/items/$d$itemId/view' as SegmentRequestKey,
          null,
          null
        ),
        shellVaryPath: getShellSegmentVaryPath(
          finalizeVaryPath(
            '/$d$workspace/items/$d$itemId/view' as SegmentRequestKey,
            null,
            null
          )
        ),
        refreshState: null,
        data: null,
        slots: new Map([['children', viewPageNode]]),
        prefetchHints: 0,
      }

      const itemIdNode: RouteTree<null> = {
        requestKey: '/$d$workspace/items/$d$itemId' as SegmentRequestKey,
        segment: ['itemId', '1', 'd', null],
        varyPath: finalizeVaryPath(
          '/$d$workspace/items/$d$itemId' as SegmentRequestKey,
          null,
          null
        ),
        shellVaryPath: getShellSegmentVaryPath(
          finalizeVaryPath(
            '/$d$workspace/items/$d$itemId' as SegmentRequestKey,
            null,
            null
          )
        ),
        refreshState: null,
        data: null,
        slots: new Map([['children', viewNode]]),
        prefetchHints: 0,
      }

      const itemsNode: RouteTree<null> = {
        requestKey: '/$d$workspace/items' as SegmentRequestKey,
        segment: 'items',
        varyPath: finalizeVaryPath(
          '/$d$workspace/items' as SegmentRequestKey,
          null,
          null
        ),
        shellVaryPath: getShellSegmentVaryPath(
          finalizeVaryPath(
            '/$d$workspace/items' as SegmentRequestKey,
            null,
            null
          )
        ),
        refreshState: null,
        data: null,
        slots: new Map([['children', itemIdNode]]),
        prefetchHints: 0,
      }

      const workspaceNode: RouteTree<null> = {
        requestKey: '/$d$workspace' as SegmentRequestKey,
        segment: ['workspace', 'acme', 'd', null],
        varyPath: finalizeVaryPath(
          '/$d$workspace' as SegmentRequestKey,
          null,
          null
        ),
        shellVaryPath: getShellSegmentVaryPath(
          finalizeVaryPath('/$d$workspace' as SegmentRequestKey, null, null)
        ),
        refreshState: null,
        data: null,
        slots: new Map([
          ['children', itemsNode],
          ['modal', modalCatchAllNode],
        ]),
        prefetchHints: 0,
      }

      const rootNode: RouteTree<null> = {
        requestKey: ROOT_SEGMENT_REQUEST_KEY,
        segment: ROOT_SEGMENT_REQUEST_KEY,
        varyPath: finalizeVaryPath(ROOT_SEGMENT_REQUEST_KEY, null, null),
        shellVaryPath: getShellSegmentVaryPath(
          finalizeVaryPath(ROOT_SEGMENT_REQUEST_KEY, null, null)
        ),
        refreshState: null,
        data: null,
        slots: new Map([['children', workspaceNode]]),
        prefetchHints: 0,
      }

      const headNode: RouteTree<null> = {
        requestKey: '/_head' as SegmentRequestKey,
        segment: PAGE_SEGMENT_KEY,
        varyPath: finalizeVaryPath(
          '/_head' as SegmentRequestKey,
          EMPTY_SEARCH,
          null
        ),
        shellVaryPath: getShellSegmentVaryPath(
          finalizeVaryPath('/_head' as SegmentRequestKey, EMPTY_SEARCH, null)
        ),
        refreshState: null,
        data: null,
        slots: null,
        prefetchHints: 0,
      }

      const root: RootRouteTree<null> = createRootRouteTree(rootNode, headNode)

      const now = Date.now()
      // Discover route from initial visit to /acme/items/1/view
      discoverKnownRoute(
        now,
        '/acme/items/1/view',
        EMPTY_SEARCH,
        null,
        null,
        root,
        false,
        '/acme/items/1/view',
        EMPTY_SEARCH,
        true,
        false
      )

      // When prefetching sibling /acme/items/2/view, the URL matches through static 'items',
      // so 'catchAll' param in @modal slot is unresolved. matchKnownRoute must return null
      // to let the server resolve the route rather than predicting a broken route tree.
      const match = matchKnownRoute(now, '/acme/items/2/view', EMPTY_SEARCH)
      expect(match).toBeNull()
    })
  })
})
