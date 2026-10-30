import Link from 'next/link'

export default function Home() {
  return (
    <main>
      <h1>home</h1>
      <Link href="/target" id="to-target">
        go to target
      </Link>
    </main>
  )
}
