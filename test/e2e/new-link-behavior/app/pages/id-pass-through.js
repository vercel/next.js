import Link from 'next/link'
export default function Page() {
  return (
    <Link href="/" oldBehavior={false} id="home-link">
      Home
    </Link>
  )
}
