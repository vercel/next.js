import Link from 'next/link'

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <div id="non-intercepted-page">
      <h1>No Interception Page</h1>
      <p>No route interception</p>
      <p>Param: {id}</p>
      <Link href="/">Back</Link>
    </div>
  )
}
