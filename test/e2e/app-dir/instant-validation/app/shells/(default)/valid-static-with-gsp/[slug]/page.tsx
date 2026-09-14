import { Suspense } from 'react'

export const instant = {
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
        This page guards link data access with a suspense, so it should pass
        validation.
      </p>
      <Suspense fallback="Loading...">
        <LinkData params={params} />
      </Suspense>
    </main>
  )
}

async function LinkData({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <div>{`Static slug: ${slug}`}</div>
}
