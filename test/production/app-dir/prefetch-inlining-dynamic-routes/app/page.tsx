import Link from 'next/link'

export default function Page() {
  return (
    <div>
      <p>Home</p>
      <Link href="/posts/hello">Post</Link>
    </div>
  )
}
