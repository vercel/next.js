import Link from 'next/link'

export default function Page({ params }) {
  const albums = ['album1', 'album2', 'album3']
  return (
    <div>
      <h2>Artist: {params.artist}</h2>
      <ul>
        {albums.map((album) => (
          <li key={album}>
            <Link href={`/${params.artist}/${album}`}>{album}</Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
