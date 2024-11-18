import Link from 'next/link'

export default async function Page({ params }) {
  const albums = ['album1', 'album2', 'album3']
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
