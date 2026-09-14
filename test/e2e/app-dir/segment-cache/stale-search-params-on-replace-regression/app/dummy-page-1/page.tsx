import Link from 'next/link'

export default function Page() {
  return (
    <>
      <h1 id="dummy-page-1">Dummy Page 1</h1>
      <Link id="link-to-dummy-2" href="/dummy-page-2">
        Go to dummy page 2
      </Link>
    </>
  )
}
