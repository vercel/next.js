import { Instant } from 'next'

export const instant: Instant = {
  level: 'experimental-error',
  unstable_samples: [{ params: { slug: '123' } }],
}

export const prefetch = 'partial'

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
        This page is missing a suspense around a link data access, so we can't
        render a shell.
      </p>
      <LinkData params={params} />
    </main>
  )
}

async function LinkData({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <div>{`Static slug: ${slug}`}</div>
}
