import Link from 'next/link'

export default function Home() {
  return (
    <>
      <h1 id="home">Home</h1>
      <Link id="to-post" href="/post">
        To post
      </Link>
      <Link id="to-missing" href="/missing">
        To missing
      </Link>
    </>
  )
}
