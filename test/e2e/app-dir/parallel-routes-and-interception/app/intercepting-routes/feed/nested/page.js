import Link from 'next/link'

export default function Page() {
  return (
    <>
      <h1 id="feed-page">Feed</h1>
      <ul>
        {Array.from({ length: 10 }).map((_, i) => (
          <li key={i}>
            <Link href={`/intercepting-routes/photos/${i}`}>Link {i}</Link>
          </li>
        ))}
      </ul>
    </>
  )
}
