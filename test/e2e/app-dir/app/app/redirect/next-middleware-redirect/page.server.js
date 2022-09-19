import Link from 'next/link'

export default function Page() {
  return (
    <>
      <Link href="/redirect-middleware-to-dashboard">
        <a id="redirect-middleware">To Dashboard through /redirect/a</a>
      </Link>
    </>
  )
}
