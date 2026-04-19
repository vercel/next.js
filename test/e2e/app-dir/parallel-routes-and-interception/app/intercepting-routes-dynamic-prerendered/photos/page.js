import Link from 'next/link'

export default function Page() {
  return (
    <>
      <h1 id="photos-page">Photos</h1>
      <ul>
        {Array.from({ length: 3 }).map((_, i) => (
          <li key={i}>
            <Link href={`/intercepting-routes-dynamic-prerendered/photos/${i}`}>
              Link {i}
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
