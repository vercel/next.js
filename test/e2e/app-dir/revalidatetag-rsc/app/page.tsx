import RevalidateViaForm from './RevalidateViaForm'
import Link from 'next/link'

export default async function Page() {
  const data = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random',
    {
      next: {
        tags: ['data'],
        revalidate: false,
      },
    }
  ).then((res) => res.text())

  return (
    <div>
      <span id="data">{data}</span>
      <RevalidateViaForm tag="data" />
      <Link href="/revalidate_via_page?tag=data" id="revalidate-via-page">
        Revalidate via page
      </Link>
    </div>
  )
}
