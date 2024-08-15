import Link from 'next/link'

export default function Page({ params: { id } }: { params: { id: string } }) {
  return (
    <div id="non-intercepted-page">
      <h1>No Interception Page</h1>
      <p>No route interception</p>
      <p>Param: {id}</p>
      <Link href="/">Back</Link>
    </div>
  )
}
