import Link from 'next/link'

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <div id="intercepted-page">
      <h1>Interception Page</h1>
      <p>Param: {id}</p>
      <Link href="/">Back</Link>
    </div>
  )
}
