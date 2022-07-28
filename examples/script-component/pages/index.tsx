import Link from 'next/link'

export default function Index() {
  return (
    <main>
      <h1>Script component examples</h1>
      <ul>
        <li>
          <Link href="/polyfill">Polyfill</Link>
        </li>
        <li>
          <Link href="/lazy">Lazy Loading</Link>
        </li>
        <li>
          <Link href="/onload">Executing code after loading</Link>
        </li>
        <li>
          <Link href="/inline">Inline scripts</Link>
        </li>
        <li>
          <Link href="/attributes">Forwarding attributes</Link>
        </li>
      </ul>
    </main>
  )
}
