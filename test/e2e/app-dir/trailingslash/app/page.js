import Link from 'next/link'
export default function HomePage() {
  return (
    <>
      <p>
        <Link href="/a/">
          <a id="to-a-trailing-slash">To a with trailing slash</a>
        </Link>
      </p>
    </>
  )
}
