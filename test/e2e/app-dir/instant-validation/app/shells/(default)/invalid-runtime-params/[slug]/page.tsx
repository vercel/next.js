import { Instant } from 'next'

export const instant: Instant = {
  level: 'experimental-error',
  unstable_samples: [{ params: { slug: '123' } }],
}

export const prefetch = 'allow-runtime'

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <main>
      <p>
        This page has an unguarded params (link data) access. This is not
        allowed in a shell (despite opting into runtime prefetching), so it
        should fail validation.
      </p>
      <LinkData params={params} />
    </main>
  )
}

async function LinkData({ params }: { params: Promise<{ slug: string }> }) {
  await params
  return <div>Link data - params</div>
}
