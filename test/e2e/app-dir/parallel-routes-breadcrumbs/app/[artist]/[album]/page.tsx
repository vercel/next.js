import Link from 'next/link'

export default async function Page({ params }) {
  const tracks = ['track1', 'track2', 'track3']
  const { artist, album } = await params
  return (
    <div>
      <h2>Album: {album}</h2>
      <ul>
        {tracks.map((track) => (
          <li key={track}>
            <Link href={`/${artist}/${album}/${track}`}>{track}</Link>
          </li>
        ))}
      </ul>
      <Link href={`/${artist}`}>Back to artist</Link>
    </div>
  )
}
