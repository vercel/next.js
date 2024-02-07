import Link from 'next/link'

export default function Page() {
  return (
    <div>
      <p>hello world</p>
      <Link href={'/first'}>First</Link>
      <Link href={'/second'}>Second</Link>
    </div>
  )
}
