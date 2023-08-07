import Link from 'next/link'

export const dynamic = 'force-static'

export function generateStaticParams() {
  return [{ slug: 'first' }, { slug: 'second' }]
}

export default function Page({ params }) {
  return (
    <main>
      <h1>{params.slug}</h1>
      <ul>
        <li>
          <Link href="/another">Visit another page</Link>
        </li>
      </ul>
    </main>
  )
}
