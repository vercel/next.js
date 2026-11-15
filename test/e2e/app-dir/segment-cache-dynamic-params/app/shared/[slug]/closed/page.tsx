import Link from 'next/link'

export const dynamicParams = false

export function generateStaticParams() {
  return [{ slug: 'allowed' }]
}

export default function Page() {
  return (
    <>
      <p id="shared-closed-page">Closed sibling</p>
      <Link id="open-sibling" href="/shared/allowed/open" prefetch={false}>
        Open sibling
      </Link>
    </>
  )
}
