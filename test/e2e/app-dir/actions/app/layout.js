import Link from 'next/link'

export default function RootLayout({ children }) {
  return (
    <html>
      <head />
      <body>
        <div id="random-number">{Math.random()}</div>
        <div>
          <div>
            <Link id="navigate-client" href="/client">
              Client
            </Link>
          </div>
          <div>
            <Link id="navigate-server" href="/server">
              Server
            </Link>
          </div>
          <div>
            <Link id="navigate-revalidate" href="/revalidate">
              Client and Server
            </Link>
          </div>
        </div>
        {children}
      </body>
    </html>
  )
}
