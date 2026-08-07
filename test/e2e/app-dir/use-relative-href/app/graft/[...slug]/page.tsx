import Link from 'next/link'
import { RelativeHrefs } from '../../relative-hrefs'

export default async function GraftPage({
  params,
}: {
  params: Promise<{ slug: string[] }>
}) {
  const { slug } = await params
  return (
    <div>
      <p id="graft-page-slug">Graft page for {slug.join('/')}</p>
      <RelativeHrefs id="graft-page-hrefs" targets={['/graft', '/']} />
      <Link id="graft-nav-link" href="/graft/x/y">
        Go to /graft/x/y
      </Link>
    </div>
  )
}
