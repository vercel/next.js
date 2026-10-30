import Link from 'next/link'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function Page(props) {
  const params = await props.params
  if (params.id === '404') {
    notFound()
  }

  return (
    <>
      <p id="page">{`group-dynamic [id]`}</p>
      <Link href="/group-dynamic/404" id="to-404">
        to 404
      </Link>
    </>
  )
}
