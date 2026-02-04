import Link from 'next/link'

export default function Layout({ children, modal }) {
  return (
    <div>
      <h1>intercepting-siblings</h1>
      <div style={{ border: '1px solid black', padding: '1rem' }}>
        {children}
      </div>
      <hr />
      <div style={{ border: '1px solid black', padding: '1rem' }}>{modal}</div>
      <h1>links</h1>
      <ul>
        <li>
          <Link href="/intercepting-siblings">/intercepting-siblings</Link>
        </li>
        <li>
          <Link href="/intercepting-siblings/1">/intercepting-siblings/1</Link>
        </li>
        <li>
          <Link href="/intercepting-siblings/2">/intercepting-siblings/2</Link>
        </li>
        <li>
          <Link href="/intercepting-siblings/3">/intercepting-siblings/3</Link>
        </li>
      </ul>
    </div>
  )
}
