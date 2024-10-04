import Link from 'next/link'

export default function Page({ params }) {
  const tracks = ['track1', 'track2', 'track3']
  return (
    <div>
      <h2>Album: {params.album}</h2>
      <ul>
        {tracks.map((track) => (
          <li key={track}>
            <Link href={`/${params.artist}/${params.album}/${track}`}>
              {track}
            </Link>
          </li>
        ))}
      </ul>
      <Link href={`/${params.artist}`}>Back to artist</Link>
    </div>
  )
}
