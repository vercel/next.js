import Link from 'next/link'

export default function NotFound() {
  return (
    <>
      <h1 id="forbidden-component">Forbidden!</h1>
      <Link href="/result" id="to-result">
        To Result
      </Link>
    </>
  )
}
