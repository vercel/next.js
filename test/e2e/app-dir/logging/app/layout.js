import Link from 'next/link'

export const fetchCache = 'default-cache'

export default function Layout({ children }) {
  return (
    <html>
      <body>
        <header>
          <Link id="nav-link" href={'/link'}>
            /link
          </Link>
          <br />
          <Link id="nav-headers" href={'/headers'}>
            /headers
          </Link>
          <br />
          <Link id="nav-default-cache" href={'/default-cache'}>
            /default-cache
          </Link>
          <br />
          <Link id="nav-cache-revalidate" href={'/cache-revalidate'}>
            /cache-revalidate
          </Link>
          <br />
          <Link id="nav-many-requests" href={'/many-requests'}>
            /many-requests
          </Link>
          <br />
        </header>
        <div>{children}</div>
      </body>
    </html>
  )
}
