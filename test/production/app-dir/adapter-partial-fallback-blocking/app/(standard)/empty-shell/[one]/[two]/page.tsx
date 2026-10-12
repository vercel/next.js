// This route intentionally produces EMPTY build-time shells: the params are
// read outside of any Suspense boundary (and there is no loading.tsx), so the
// postpone propagates to the root. `instant = false` opts the route out of
// requiring an instant (non-empty) shell.
//
// The empty shells downgrade the generic route to a blocking route, but `two`
// is still never provided by `generateStaticParams`: an on-demand render may
// only complete `one`, so only `one` may participate in the cache key.
export function generateStaticParams() {
  return [{ one: 'a' }]
}

export const instant = false

export default async function Page({
  params,
}: {
  params: Promise<{ one: string; two: string }>
}) {
  const { one, two } = await params

  return (
    <div>
      {one}:{two}
    </div>
  )
}
