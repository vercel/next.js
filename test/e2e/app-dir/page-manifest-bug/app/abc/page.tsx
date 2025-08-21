import Link from 'next/link'

export default function Abc() {
  return (
    <>
      <h1 id="page-title-abc">ABC Page</h1>
      <p>
        <Link href="/" prefetch={false}>
          go to home page
        </Link>
      </p>
    </>
  )
}
