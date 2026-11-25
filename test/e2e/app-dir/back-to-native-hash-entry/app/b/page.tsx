import Link from 'next/link'

export default function PageB() {
  return (
    <>
      <h1 id="page-heading">Page B</h1>
      <Link id="link-to-a" href="/">
        Next.js link to Page A
      </Link>
    </>
  )
}
