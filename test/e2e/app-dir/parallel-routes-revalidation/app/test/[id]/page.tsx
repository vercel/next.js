import Link from 'next/link'

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <div>
      <h2 id="test-detail-page">Test Detail Page</h2>
      <Link id="go-test-id-new" href={`/test/${id}/new`}>
        Go to /test/{id}/new
      </Link>
    </div>
  )
}
