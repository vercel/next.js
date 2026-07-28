import Link from 'next/link'

export default function Page() {
  return (
    <main>
      <p>navigation source</p>
      <Link id="to-target" href="/target" prefetch={false}>
        target
      </Link>
    </main>
  )
}
