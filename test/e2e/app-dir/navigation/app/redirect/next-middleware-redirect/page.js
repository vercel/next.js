import Link from 'next/link'

export default function Page() {
  return (
    <>
      <Link href="/redirect-middleware-to-dashboard" id="redirect-middleware">
        To Dashboard through /redirect/a
      </Link>
    </>
  )
}
