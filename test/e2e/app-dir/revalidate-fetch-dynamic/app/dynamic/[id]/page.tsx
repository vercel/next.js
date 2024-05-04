import Link from 'next/link'

export default async function PostPage({
  params: { id },
}: {
  params: { id: string }
}) {
  const req = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random'
  )
  const randomNumber = await req.text()

  return (
    <div id="dynamic-page">
      <div>Page Id: {id}</div>
      <div>
        Server Data: <span id="random-number">{randomNumber}</span>
      </div>

      <Link href="/">Go back home</Link>
    </div>
  )
}
