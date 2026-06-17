import Link from 'next/link'

export default async function Page({ params }) {
  // Link order affects prefetch priority: viewport prefetches are scheduled so
  // that links nearest the top of the document are prefetched first.
  const albums = ['album3', 'album2', 'album1']
  const { artist } = await params
  return (
    <div>
      <h2>Artist: {artist}</h2>
      <ul>
        {albums.map((album) => (
          <li key={album}>
            <Link href={`/${artist}/${album}`}>{album}</Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
