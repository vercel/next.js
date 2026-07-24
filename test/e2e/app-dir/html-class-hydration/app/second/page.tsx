import Link from 'next/link'

export default function Second() {
  return (
    <main>
      <p id="second">second</p>
      <Link href="/" id="to-home">
        to home
      </Link>
    </main>
  )
}
