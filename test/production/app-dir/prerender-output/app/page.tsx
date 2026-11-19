import Link from 'next/link'

export default function Page() {
  return (
    <Link
      href="/prerender-output/partial/background"
      prefetch={false}
      id="target"
    >
      Navigate
    </Link>
  )
}
