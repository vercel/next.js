import Link from 'next/link'

export default function Home() {
  return (
    <>
      <p id="home-content">Home page</p>
      <Link href="/page1" prefetch={true}>
        Go to page 1
      </Link>
    </>
  )
}
