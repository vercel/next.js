import Link from 'next/link'

export default function HomePage() {
  return (
    <Link
      id="link"
      href={{
        pathname: '/[slug]',
        query: { slug: '1' },
      }}
    >
      to slug
    </Link>
  )
}
