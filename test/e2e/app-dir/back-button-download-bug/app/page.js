import Link from 'next/link'

export default function Home() {
  return (
    <>
      <h1 id="home-page">Home!</h1>
      <Link href="/post/1" id="to-post-1">
        To post 1
      </Link>
      <Link href="/">To /</Link>
    </>
  )
}
