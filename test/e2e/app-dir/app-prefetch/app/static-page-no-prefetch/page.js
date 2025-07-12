import Link from 'next/link'

export default async function Page() {
  return (
    <>
      <p id="static-page-no-prefetch">Static Page No Prefetch</p>
      <p>
        <Link href="/" id="to-home">
          To home
        </Link>
      </p>
    </>
  )
}
