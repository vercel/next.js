import Link from 'next/link'

export default function Page() {
  return (
    <>
      <p>hello world</p>
      <Link href="/does-not-exist" id="link-to-missing">
        go to missing page
      </Link>
    </>
  )
}
