import { Instant } from 'next'

export const instant: Instant = {
  level: 'experimental-error',
  unstable_samples: [{ searchParams: {} }],
}
export const prefetch = 'allow-runtime'

export default async function Page({ searchParams }) {
  return (
    <main>
      <p>
        This page has an unguarded search params (link data) access. This is not
        allowed in a shell (despite opting into runtime prefetching), so it
        should fail validation.
      </p>
      <LinkData searchParams={searchParams} />
    </main>
  )
}

async function LinkData({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[]>>
}) {
  await searchParams
  return <div>Link data - search params</div>
}
