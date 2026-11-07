import Link from 'next/link'

export default function Layout({ children }) {
  return (
    <html>
      <body>
        {children}
        <hr />
        <Link href="/page-with-h1" id="page-with-h1">
          /page-with-h1
        </Link>
        <br />
        <Link href="/page-with-title" id="page-with-title">
          /page-with-title
        </Link>
        <br />
        <Link href="/noop-layout/page-1" id="noop-layout-page-1">
          /noop-layout/page-1
        </Link>
        <br />
        <Link href="/noop-layout/page-2" id="noop-layout-page-2">
          /noop-layout/page-2
        </Link>
        <br />
        <Link href="/shared-title/page-a" id="shared-title-page-a">
          /shared-title/page-a
        </Link>
        <br />
        <Link href="/shared-title/page-b" id="shared-title-page-b">
          /shared-title/page-b
        </Link>
        <br />
        <Link href="/shared-title/no-h1-1" id="shared-title-no-h1-1">
          /shared-title/no-h1-1
        </Link>
        <br />
        <Link href="/shared-title/no-h1-2" id="shared-title-no-h1-2">
          /shared-title/no-h1-2
        </Link>
        <br />
      </body>
    </html>
  )
}
