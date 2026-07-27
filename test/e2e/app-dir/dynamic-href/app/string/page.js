import Link from 'next/link'

export default function HomePage() {
  return (
    <Link id="link" href="/object/[slug]">
      to slug
    </Link>
  )
}
