export async function generateStaticParams() {
  return [{ slug: '123' }]
}

// NOTE: the page must export the following literally, we can't
// reexport them from here:
//
// export const prefetch = 'partial'
// export const instant: Instant = {
//   level: 'experimental-error',
//   unstable_samples: [{ params: { slug: '123' } }],
// }

type Params = { slug: string }

export default async function Page({ params }: { params: Promise<Params> }) {
  return (
    <main>
      <p>
        This page has an unguarded session data access. This is not allowed in
        Partial Prefetching, regardless of <code>{`ensureStatic`}</code>,
        because it blocks the shell.
      </p>
      <Slug params={params} />
    </main>
  )
}

async function Slug({ params }: { params: Promise<Params> }) {
  const { slug } = await params
  return <div>Slug: {slug}</div>
}
