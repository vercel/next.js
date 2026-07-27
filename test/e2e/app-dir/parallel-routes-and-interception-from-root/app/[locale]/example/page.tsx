import Link from 'next/link'

export default function Page() {
  return (
    <div>
      <h1>Example Page</h1>
      <Link href="/en/intercepted">Intercept /en/intercepted</Link>
    </div>
  )
}
