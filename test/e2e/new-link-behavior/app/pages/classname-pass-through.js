import Link from 'next/link'
export default function Page() {
  return (
    <Link href="/" oldBehavior={false} className="home-link">
      Home
    </Link>
  )
}
