import Link from 'next/link'

export default function Page() {
  return (
    <Link href="/some/route/for?json=true">
      <a id="link">to /some/route/for?json=true</a>
    </Link>
  )
}
