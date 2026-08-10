import Link from 'next/link'

export default function LangHome() {
  return (
    <div>
      <h1 data-testid="blocking-landing">Landing</h1>
      <Link href="/blocking-fallback/en/s1" id="to-blocking-scope">
        Go deeper
      </Link>
    </div>
  )
}
