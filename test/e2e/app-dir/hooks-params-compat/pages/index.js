import Link from 'next/link'

/** Add your relevant code here for the issue to reproduce */
export default function Home() {
  return (
    <main>
      <p>
        This reproduction demonstrates unexpected differences in behavior for
        useSearchParams() and useParams() in the app router and the pages
        router.
      </p>

      <li>
        <Link href="/pages/foobar">/pages/foobar</Link>
      </li>
      <li>
        <Link href="/pages/foobar?baz=lorem">/pages/foobar?baz=lorem</Link>
      </li>
      <li>
        <Link href="/app/foobar">/app/foobar</Link>
      </li>
      <li>
        <Link href="/app/foobar?baz=lorem">/app/foobar?baz=lorem</Link>
      </li>
    </main>
  )
}
