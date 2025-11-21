import Link from 'next/link'

export default function Page() {
  return (
    <>
      <Link href="/" id="to-index">
        to /
      </Link>
      <br />
      {/* <Link href="/basic" id="to-basic">
        to /basic
      </Link> */}
    </>
  )
}

export const metadata = {
  title: 'Inner Page',
}
