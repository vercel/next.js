import Link from 'next/link'

export default function FooPage() {
  return (
    <div>
      <h1>Foo Page</h1>
      <Link href="/post/1">Post 1</Link>
    </div>
  )
}
