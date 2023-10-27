import Link from 'next/link'

export default async function Page() {
  return (
    <>
      <p id="static-page">Static Page</p>
      <p>
        <Link href="/" id="to-home">
          To home
        </Link>
      </p>
    </>
  )
}
