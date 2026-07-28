import type { Segment } from '../../../shared/lib/app-router-types'
import type { LoaderTree } from '../../lib/app-dir-module'
import type { GetDynamicParamFromSegment } from '../app-render'
import type { NextParsedUrlQuery } from '../../request-meta'
import { addSearchParamsIfPageSegment } from '../../../shared/lib/segment'
import { workUnitAsyncStorage } from '../work-unit-async-storage.external'

/**
 * Used to identify a segment during instant validation. Conceptually similar
 * to request keys in the Client Segment Cache.
 *
 * These paths are produced in two places that must agree exactly: the flight
 * render records serialized fork slots by path (see
 * `RecordSerializedForkSlot` in `create-component-tree.tsx`), and the
 * validation payload builders look segments up by path. Always build paths
 * with the helpers in this module.
 */
export type SegmentPath = string & { _tag: 'SegmentPath' }

export function stringifySegment(segment: Segment): SegmentPath {
  return (
    typeof segment === 'string'
      ? encodeURIComponent(segment)
      : encodeURIComponent(segment[0]) + '|' + segment[1] + '|' + segment[2]
  ) as SegmentPath
}

export function createChildSegmentPath(
  parentPath: SegmentPath,
  parallelRouteKey: string,
  segment: Segment
): SegmentPath {
  const parallelRoutePrefix =
    parallelRouteKey === 'children'
      ? ''
      : `@${encodeURIComponent(parallelRouteKey)}/`
  return `${parentPath}/${parallelRoutePrefix}${stringifySegment(segment)}` as SegmentPath
}

/**
 * Resolves the Segment used for a LoaderTree node's SegmentPath: the dynamic
 * param's tree segment when the node is dynamic, otherwise the raw segment
 * (with search params attached for page segments).
 */
export function getValidationSegment(
  loaderTree: LoaderTree,
  getDynamicParamFromSegment: GetDynamicParamFromSegment,
  query: NextParsedUrlQuery | null
): Segment {
  const dynamicParam = getDynamicParamFromSegment(loaderTree)
  if (dynamicParam) {
    return dynamicParam.treeSegment
  }
  const segment = loaderTree[0]
  return query ? addSearchParamsIfPageSegment(segment, query) : segment
}

/**
 * The serialized-fork-slot recorder of the render in progress, or undefined
 * when the current work unit isn't a recording-armed request render. Only
 * dev renders that will be validated arm recording (see
 * `RequestStore.serializedForkSlots`).
 */
export function getSerializedForkSlotsRecorder(): Set<string> | undefined {
  const workUnitStore = workUnitAsyncStorage.getStore()
  if (workUnitStore === undefined) {
    return undefined
  }
  switch (workUnitStore.type) {
    case 'request':
      return workUnitStore.serializedForkSlots
    case 'prerender':
    case 'prerender-client':
    case 'prerender-ppr':
    case 'prerender-legacy':
    case 'prerender-runtime':
    case 'validation-client':
    case 'cache':
    case 'private-cache':
    case 'unstable-cache':
    case 'generate-static-params':
      return undefined
    default:
      workUnitStore satisfies never
      return undefined
  }
}
