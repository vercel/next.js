import Link from 'next/link'

export default function Page() {
  return (
    <div>
      <h1 data-testid="home-title">Home</h1>
      <Link href="/target-page" id="link-to-target">
        Go to target
      </Link>
    </div>
  )
}
