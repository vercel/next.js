import Link from 'next/link'

export default function Home() {
  return (
    <div>
      Go to <Link href="/redirect/source">Redirect Link</Link>
    </div>
  )
}
