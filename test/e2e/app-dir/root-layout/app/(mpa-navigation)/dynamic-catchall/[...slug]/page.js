import Link from 'next/link'

export default function Page({ params }) {
  const nextUrl = [...params.slug, 'slug']
  return (
    <>
      <Link id="to-next-url" href={`/dynamic-catchall/${nextUrl.join('/')}`}>
        To next url
      </Link>
      <Link href="/dynamic/first" id="to-dynamic-first">
        To next url
      </Link>
      <p id={`catchall-${params.slug.join('-')}`}>
        catchall {params.slug.join(' ')}
      </p>
    </>
  )
}
