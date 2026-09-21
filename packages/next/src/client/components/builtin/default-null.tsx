export const PARALLEL_ROUTE_DEFAULT_NULL_PATH =
  'next/dist/client/components/builtin/default-null.js'
const PARALLEL_ROUTE_DEFAULT_NULL_ESM_PATH =
  'next/dist/esm/client/components/builtin/default-null.js'

export function isParallelRouteDefaultNullPath(path: string): boolean {
  return (
    path.endsWith(PARALLEL_ROUTE_DEFAULT_NULL_PATH) ||
    path.endsWith(PARALLEL_ROUTE_DEFAULT_NULL_ESM_PATH)
  )
}

export default function ParallelRouteDefaultNull() {
  return null
}
