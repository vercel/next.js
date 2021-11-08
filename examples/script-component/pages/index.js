import Link from "next/link"

import s from "../styles/index.module.css"

export default function Index() {
  return (
    <main className={s.container}>
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
