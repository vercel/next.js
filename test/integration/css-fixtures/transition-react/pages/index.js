import Link from 'next/link'

export default function Home() {
  return (
    <main>
      <Link href="/other" prefetch={false}>
        <a id="link-other">other</a>
      </Link>
    </main>
  )
}
