import Link from 'next/link'

export default function Page({ params }) {
  return (
    <div>
      <h2>Track: {params.track}</h2>
      <Link href={`/${params.artist}/${params.album}`}>Back to album</Link>
    </div>
  )
}
