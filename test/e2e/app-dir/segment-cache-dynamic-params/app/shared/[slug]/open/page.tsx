import Link from 'next/link'

export function generateStaticParams() {
  return [{ slug: 'allowed' }]
}

export default function Page() {
  return (
    <>
      <p id="shared-open-page">Open sibling</p>
      <Link id="closed-sibling" href="/shared/allowed/closed" prefetch={false}>
        Closed sibling
      </Link>
    </>
  )
}
