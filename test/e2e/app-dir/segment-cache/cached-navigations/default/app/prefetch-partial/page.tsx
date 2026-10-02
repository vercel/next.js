import { RuntimeContent } from '../../components/runtime-content'

// `prefetch = 'partial'` enables Partial Prefetching, which also opts the route
// into runtime Cached Navigations.
export const prefetch = 'partial'

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  return <RuntimeContent searchParams={searchParams} />
}
