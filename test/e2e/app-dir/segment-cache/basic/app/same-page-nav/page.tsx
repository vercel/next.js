import Link from 'next/link'
import { connection } from 'next/server'

export default async function SamePageNav() {
  // Treat the page as dynamic so we can detect when it's refreshed
  await connection()

  return (
    <>
      <p>
        Demonstrates that when navigating to the exact same URL as the current
        location, we refresh the page segments.
      </p>
      <p>
        Observe that the random number below changes if you click the same link
        multiple times, but not when you switch between links.
      </p>
      <p>
        Random number (changes on each refresh):{' '}
        <span id="random-number">
          {Math.floor(Math.random() * 1_000_000_000)}
        </span>
      </p>
      <ul>
        <li>
          <Link href="/same-page-nav">Link to current page</Link>
        </li>
        <li id="hash-b">
          <Link href="/same-page-nav#hash-a">
            Link to current page with hash fragment <code>#hash-a</code>
          </Link>
        </li>
        <li id="hash-a">
          <Link href="/same-page-nav#hash-b">
            Link to current page with hash fragment <code>#hash-b</code>
          </Link>
        </li>
      </ul>
    </>
  )
}
