import Link from 'next/link'

export default function Home() {
  return (
    <main>
      <h1>AsyncLocalStorage Context Loss Test</h1>
      <p>
        Click a link to trigger runtime prefetch and test context preservation:
      </p>
      <ul>
        <li>
          <Link href="/test-page/123">Test with params</Link>
        </li>
        <li>
          <Link href="/test-cookies">Test with cookies()</Link>
        </li>
        <li>
          <Link href="/test-headers">Test with headers()</Link>
        </li>
        <li>
          <Link href="/test-generic-promise">Test with generic promise</Link>
        </li>
      </ul>
    </main>
  )
}
