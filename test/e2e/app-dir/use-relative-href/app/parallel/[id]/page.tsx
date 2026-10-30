import Link from 'next/link'
import { RelativeHrefs } from '../../relative-hrefs'

export default async function ParallelPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <div>
      <p>Parallel page for {id}</p>
      <RelativeHrefs
        id="parallel-page-hrefs"
        targets={['/parallel/[id]', '/parallel', '/']}
      />
      <Link id="parallel-nav-link" href="/parallel/456">
        Go to parallel 456
      </Link>
    </div>
  )
}
