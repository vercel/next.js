import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function Page() {
  return (
    <>
      <p id="dynamic-page">Dynamic Page</p>
      <p>
        <Link href="/" id="to-home">
          To home
        </Link>
      </p>
      <p>
        <Link href="/dynamic-page" prefetch>
          To Same Page
        </Link>
      </p>
    </>
  )
}
