import Link from 'next/link'

export default async function Home() {
  // Link order affects prefetch priority: viewport prefetches are scheduled so
  // that links nearest the top of the document are prefetched first.
  const artists = ['artist3', 'artist2', 'artist1']
  return (
    <div>
      <h1>Artists</h1>
      <ul>
        {artists.map((artist) => (
          <li key={artist}>
            <Link href={`/${artist}`}>{artist}</Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
