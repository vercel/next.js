import Link from 'next/link'

export default function Page() {
  return (
    <>
      <p>pages-path</p>
      <Link href="/another" id="to-another">
        to /another
      </Link>
    </>
  )
}
