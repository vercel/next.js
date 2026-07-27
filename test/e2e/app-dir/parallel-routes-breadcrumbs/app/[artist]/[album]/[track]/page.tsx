import Link from 'next/link'

export default async function Page({ params }) {
  const { artist, album, track } = await params
  return (
    <div>
      <h2>Track: {track}</h2>
      <Link href={`/${artist}/${album}`}>Back to album</Link>
    </div>
  )
}
