import Link from 'next/link'

export default function Home() {
  return (
    <main>
      Home <Link href="/foo">To /foo</Link>
    </main>
  )
}
