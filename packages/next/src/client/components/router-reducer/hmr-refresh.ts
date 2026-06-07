import type {
  FlightRouterState,
  HmrRefreshTarget,
} from '../../../shared/lib/app-router-types'
import {
  DEFAULT_SEGMENT_KEY,
  PAGE_SEGMENT_KEY,
} from '../../../shared/lib/segment'
import { segmentToSourcePagePathname } from './compute-changed-path'

function getTargetPath(
  tree: FlightRouterState,
  target: HmrRefreshTarget
): string[] | null {
  const segments = target.split('/').filter(Boolean)
  const kind = segments.pop()
  if (kind !== 'page' && kind !== 'layout' && kind !== 'default') {
    return null
  }

  let node = tree
  const parallelRoutePath: string[] = []
  let selectedByParallelRoute = false

  for (const segment of segments) {
    if (segment.startsWith('@')) {
      const parallelRouteKey = segment.slice(1)
      const child = node[1][parallelRouteKey]
      if (child === undefined) {
        return null
      }
      parallelRoutePath.push(parallelRouteKey)
      node = child
      selectedByParallelRoute = true
      continue
    }

    if (
      selectedByParallelRoute &&
      segmentToSourcePagePathname(node[0]) === segment
    ) {
      selectedByParallelRoute = false
      continue
    }

    const child = node[1].children
    if (
      child === undefined ||
      segmentToSourcePagePathname(child[0]) !== segment
    ) {
      return null
    }
    parallelRoutePath.push('children')
    node = child
    selectedByParallelRoute = false
  }

  if (kind === 'layout') {
    return parallelRoutePath
  }

  const expectedSegment =
    kind === 'page' ? PAGE_SEGMENT_KEY : DEFAULT_SEGMENT_KEY
  const currentSegment = node[0]
  if (
    typeof currentSegment === 'string' &&
    currentSegment.startsWith(expectedSegment)
  ) {
    return parallelRoutePath
  }

  const child = node[1].children
  if (
    child === undefined ||
    typeof child[0] !== 'string' ||
    !child[0].startsWith(expectedSegment)
  ) {
    return null
  }
  parallelRoutePath.push('children')
  return parallelRoutePath
}

function isPathPrefix(prefix: readonly string[], path: readonly string[]) {
  return (
    prefix.length <= path.length &&
    prefix.every((segment, index) => path[index] === segment)
  )
}

export function getHmrRefreshTargetPaths(
  tree: FlightRouterState,
  targets: readonly HmrRefreshTarget[] | undefined
): Set<string> | null {
  if (targets === undefined || targets.length === 0) {
    return null
  }

  const paths: string[][] = []
  for (const target of targets) {
    const path = getTargetPath(tree, target)
    if (path === null) {
      return null
    }
    paths.push(path)
  }

  const minimalPaths = paths.filter(
    (path, pathIndex) =>
      !paths.some(
        (otherPath, otherIndex) =>
          pathIndex !== otherIndex &&
          otherPath.length < path.length &&
          isPathPrefix(otherPath, path)
      )
  )
  return new Set(minimalPaths.map((path) => JSON.stringify(path)))
}
