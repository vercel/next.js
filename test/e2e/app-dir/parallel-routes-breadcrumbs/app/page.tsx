import Link from 'next/link'

export default async function Home() {
  const artists = ['artist1', 'artist2', 'artist3']
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
