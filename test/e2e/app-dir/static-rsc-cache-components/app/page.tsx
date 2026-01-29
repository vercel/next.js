import Link from 'next/link'

export default function Page() {
  return (
    <div id="home">
      home{' '}
      <Link href="/alpha" prefetch={false}>
        alpha
      </Link>
    </div>
  )
}
