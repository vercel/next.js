import Link from 'next/link'

export default function Index() {
  return (
    <main>
      <h1>Script component examples</h1>
      <ul>
        <li>
          <Link href="/polyfill">
            <a>Polyfill</a>
          </Link>
        </li>
        <li>
          <Link href="/lazy">
            <a>Lazy Loading</a>
          </Link>
        </li>
        <li>
          <Link href="/onload">
            <a>Executing code after loading</a>
          </Link>
        </li>
        <li>
          <Link href="/inline">
            <a>Inline scripts</a>
          </Link>
        </li>
        <li>
          <Link href="/attributes">
            <a>Forwarding attributes</a>
          </Link>
        </li>
      </ul>
    </main>
  )
}
