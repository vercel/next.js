import { RuntimeContent } from '../../components/runtime-content'

// `prefetch = 'unstable_eager'` enables Partial Prefetching, which also opts
// the route into runtime Cached Navigations.
export const prefetch = 'unstable_eager'

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  return <RuntimeContent searchParams={searchParams} />
}
