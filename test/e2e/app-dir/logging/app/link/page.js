import Link from 'next/link'

export default function Page() {
  return (
    <Link id="foo" href="/foo">
      Trigger RSC request
    </Link>
  )
}
