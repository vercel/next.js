import Link from 'next/link'

export default function Page() {
  return (
    <Link href="/second" as="mailto:hello@example.com">
      <a id="click-me">email</a>
    </Link>
  )
}
