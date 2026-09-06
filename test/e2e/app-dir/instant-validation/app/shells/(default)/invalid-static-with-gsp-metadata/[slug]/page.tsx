import { Instant } from 'next'

export const instant: Instant = {
  level: 'experimental-error',
  unstable_samples: [{ params: { slug: '123' } }],
}

export async function generateStaticParams() {
  return [{ slug: '123' }]
}

export const prefetch = 'partial'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await params
  return {}
}

export default async function Page() {
  return (
    <main>
      <p>
        This page accesses link data only in generate metadata, so we can't
        prefetch a complete App Shell.
      </p>
    </main>
  )
}
