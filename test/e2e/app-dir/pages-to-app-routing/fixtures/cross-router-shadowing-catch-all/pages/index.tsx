import Link from 'next/link'

export default function Home() {
  return (
    <>
      <h1 id="page-title">Pages Home</h1>
      <Link id="to-lang-link" href="/en">
        To App Lang
      </Link>
      <Link id="to-lang-about-link" href="/en/about">
        To App About
      </Link>
    </>
  )
}
