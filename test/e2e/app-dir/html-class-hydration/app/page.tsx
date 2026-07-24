import Link from 'next/link'

export default function Page() {
  return (
    <main>
      <p id="home">home</p>
      <Link href="/second" id="to-second">
        to second
      </Link>
    </main>
  )
}
