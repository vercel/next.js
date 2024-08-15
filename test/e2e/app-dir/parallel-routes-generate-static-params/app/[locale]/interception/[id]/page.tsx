import Link from 'next/link'

export default function Page({ params: { id } }: { params: { id: string } }) {
  return (
    <div id="intercepted-page">
      <h1>Interception Page</h1>
      <p>Param: {id}</p>
      <Link href="/">Back</Link>
    </div>
  )
}
