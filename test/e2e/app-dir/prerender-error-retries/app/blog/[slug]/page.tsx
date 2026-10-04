import { ClientUrl } from '../../client-url'

export function generateStaticParams() {
  return [{ slug: 'a' }, { slug: 'b' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  // `useSearchParams()` is read in a Client Component that is not wrapped in a
  // `<Suspense>` boundary, which is a deterministic prerender validation error.
  return (
    <main>
      <h1>{slug}</h1>
      <ClientUrl />
    </main>
  )
}
