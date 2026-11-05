import Link from 'next/link'

export default function Page() {
  return (
    <main>
      <p id="home">Home</p>
      <Link href="/dest" id="to-dest">
        To dest
      </Link>
    </main>
  )
}
