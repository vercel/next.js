export async function generateStaticParams() {
  return [{ slug: '123' }]
}

export const unstable_ensureStatic = 'navigation'

// The page awaits `params` without Suspense, which blocks the app shell,
// and would fail Instant Validation in Partial Prefetching.
// It's still statically-prerenderable.
export const instant = false

type Params = { slug: string }

export default function Page({ params }: { params: Promise<Params> }) {
  return (
    <main>
      <Inner params={params} />
    </main>
  )
}

async function Inner({ params }: { params: Promise<Params> }) {
  const { slug } = await params
  return <p>Slug: {slug}</p>
}
