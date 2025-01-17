import Link from 'next/link'

export default function Home() {
  return (
    <div>
      Home <Link href="/foo">To /foo</Link>
    </div>
  )
}
