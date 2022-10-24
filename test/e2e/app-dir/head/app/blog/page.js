import Link from 'next/link'

export default function Page() {
  return (
    <>
      <p id="page">blog page</p>
      <Link href="/" id="to-index">
        to /
      </Link>
      <br />
    </>
  )
}

export async function Head() {
  return (
    <>
      <script async src="/hello3.js" />
      <title>hello from blog page</title>
    </>
  )
}
