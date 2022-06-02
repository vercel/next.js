import Link from 'next/link'

if (typeof window !== 'undefined') {
  window.NAV_PAGE_LOADED = true
}

export default function Nav() {
  return (
    <ul>
      <li>
        <Link href="/only-amp">
          <a id="only-amp-link">AMP First Page</a>
        </Link>
      </li>
      <li>
        <Link href="/var-before-export">
          <a id="var-before-export-link">Another AMP First Page</a>
        </Link>
      </li>
    </ul>
  )
}
