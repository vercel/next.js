import Link from 'next/link'
import { connection } from 'next/server'

export default async function Page() {
  // Keep this page dynamic. A page served from its build-time prerender takes
  // a different navigation path that doesn't reproduce the bug.
  await connection()

  return (
    <>
      <h1 id="hash-initial-load">Hash initial load</h1>
      <Link href="#details" id="link-to-details-hash-only">
        To #details, hash only
      </Link>
      <Link
        href="/hash-initial-load?x=y#details"
        id="link-to-details-full-href"
      >
        To #details, full href
      </Link>
      <section id="faq">FAQ</section>
      <section id="details">Details</section>
    </>
  )
}
