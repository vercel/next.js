import Link from 'next/link'
export default function Page() {
  return (
    <>
      <h1>About Page</h1>
      <Link href="/" oldBehavior={false}>
        Home
      </Link>
    </>
  )
}
