import { Instant } from 'next'

export const instant: Instant = {
  level: 'experimental-error',
  unstable_samples: [{ params: { slug: '123' } }],
}

export async function generateStaticParams() {
  return [{ slug: '123' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return (
    <main>
      <p>
        This page is missing a suspense around a link data access, but this page
        is intended to run without partialPrefetching, so this is still allowed.
      </p>
      <LinkData params={params} />
    </main>
  )
}

async function LinkData({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <div>{`Static slug: ${slug}`}</div>
}
