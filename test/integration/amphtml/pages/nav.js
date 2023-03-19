import Link from 'next/link'

if (typeof window !== 'undefined') {
  window.NAV_PAGE_LOADED = true
}

export default function Nav() {
  return (
    <ul>
      <li>
        <Link href="/only-amp" id="only-amp-link">
          AMP First Page
        </Link>
      </li>
      <li>
        <Link href="/var-before-export" id="var-before-export-link">
          Another AMP First Page
        </Link>
      </li>
    </ul>
  )
}
