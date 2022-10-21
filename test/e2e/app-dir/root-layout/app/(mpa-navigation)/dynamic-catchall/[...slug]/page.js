import Link from 'next/link'

export default function Page({ params }) {
  const nextUrl = [...params.slug, 'slug']
  return (
    <>
      <Link href={`/dynamic-catchall/${nextUrl.join('/')}`}>
        <a id="to-next-url">To next url</a>
      </Link>
      <Link href="/dynamic/first">
        <a id="to-dynamic-first">To next url</a>
      </Link>
      <p id={`catchall-${params.slug.join('-')}`}>
        catchall {params.slug.join(' ')}
      </p>
    </>
  )
}
