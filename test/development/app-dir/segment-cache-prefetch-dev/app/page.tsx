import Link from 'next/link'

export default function PageA() {
  return (
    <div>
      <h1>Page A</h1>
      <Link href="/page-b">Go to Page B</Link>
    </div>
  )
}
