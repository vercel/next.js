import Link from 'next/link'

export default function Home() {
  return (
    <>
      <h1 id="home">Home</h1>
      <Link id="to-post" href="/suspense/post">
        To post
      </Link>
    </>
  )
}
