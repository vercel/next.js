import { notFound } from '../not-found'

export const PARALLEL_ROUTE_DEFAULT_PATH =
  'next/dist/client/components/builtin/default.js'
const PARALLEL_ROUTE_DEFAULT_ESM_PATH =
  'next/dist/esm/client/components/builtin/default.js'

export function isParallelRouteDefaultPath(path: string): boolean {
  return (
    path.endsWith(PARALLEL_ROUTE_DEFAULT_PATH) ||
    path.endsWith(PARALLEL_ROUTE_DEFAULT_ESM_PATH)
  )
}

export default function ParallelRouteDefault() {
  notFound()
}
