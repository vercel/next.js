import { redirect } from 'next/navigation'

// `force-static` makes the redirect response (status + headers) cacheable.
// Serving it from the cache used to re-append the `Location` and
// `x-nextjs-stale-time` headers that the render phase already set, producing
// duplicates (#82117).
export const dynamic = 'force-static'

export default function Page() {
  redirect('/dest')
}
