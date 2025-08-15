import { unstable_cache } from 'next/cache'
import Link from 'next/link'

const cachedRandom = unstable_cache(() => Math.random(), [], {
  tags: ['cached-random'],
})

export default function RootLayout({ children }) {
  return (
    <html>
      <head />
      <body>
        <div id="random-number">{Math.random()}</div>
        <div>
          Cached Random: <span id="cached-random">{cachedRandom()}</span>
        </div>
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
