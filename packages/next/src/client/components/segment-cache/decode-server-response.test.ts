import type {
  PartialTransportNode,
  TransportSegment,
} from '../../../shared/lib/rsc-transport'
import type { DynamicParamTypesShort } from '../../../shared/lib/app-router-types'
import { createOpaqueFallbackParamValue } from '../../../shared/lib/router/utils/opaque-fallback-param'
import { decodeTransportTreeIntoRouteTree } from './decode-server-response'
import type { NormalizedSearch } from './cache-key'
import type { RouteTree } from './cache'

function param(
  name: string,
  type: DynamicParamTypesShort,
  key: string | null
): TransportSegment {
  return { n: name, t: type, k: key, s: null }
}

function node(
  segment: TransportSegment,
  child?: PartialTransportNode
): PartialTransportNode {
  return child === undefined
    ? { s: segment }
    : { s: segment, c: new Map([['children', child]]) }
}

// Builds `/(group)/items/<param>/__PAGE__` under the root layout.
function routeWith(segment: TransportSegment): PartialTransportNode {
  return node(
    '',
    node('(group)', node('items', node(segment, node('__PAGE__'))))
  )
}

function decodedParamSegment(
  transportTree: PartialTransportNode,
  renderedPathname: string | null
) {
  const tree = decodeTransportTreeIntoRouteTree(
    transportTree,
    null,
    null,
    false,
    renderedPathname,
    '' as NormalizedSearch,
    { metadataVaryPath: null, treeDivergedFromBase: false }
  )
  let current: RouteTree<unknown> = tree
  for (let depth = 0; depth < 3; depth++) {
    current = current.slots!.get('children')!
  }
  return current.segment
}

describe('decodeTransportTreeIntoRouteTree', () => {
  const placeholder = (name: string) =>
    createOpaqueFallbackParamValue(name, 'abc123')

  it('resolves an opaque dynamic param key from the rendered pathname', () => {
    expect(
      decodedParamSegment(
        routeWith(param('itemId', 'd', placeholder('itemId'))),
        '/items/expected%20id'
      )
    ).toEqual(['itemId', 'expected%20id', 'd', null])
  })

  it('resolves an opaque catch-all param key from the rendered pathname', () => {
    expect(
      decodedParamSegment(
        routeWith(param('slug', 'c', placeholder('slug'))),
        '/items/a/b'
      )
    ).toEqual(['slug', 'a/b', 'c', null])
  })

  it('resolves an opaque optional catch-all param key without parts', () => {
    expect(
      decodedParamSegment(
        routeWith(param('slug', 'oc', placeholder('slug'))),
        '/items'
      )
    ).toEqual(['slug', '', 'oc', null])
  })

  it('keeps concrete param keys', () => {
    expect(
      decodedParamSegment(
        routeWith(param('itemId', 'd', 'concrete')),
        '/items/other'
      )
    ).toEqual(['itemId', 'concrete', 'd', null])
  })

  it('keeps an opaque key when there is no rendered pathname', () => {
    expect(
      decodedParamSegment(
        routeWith(param('itemId', 'd', placeholder('itemId'))),
        null
      )
    ).toEqual(['itemId', placeholder('itemId'), 'd', null])
  })
})
