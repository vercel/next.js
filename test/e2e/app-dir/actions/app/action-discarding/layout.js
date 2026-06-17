import Link from 'next/link'
import { connection } from 'next/server'

export default async function Layout({ children }) {
  await connection()

  const cachedRandom = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?key=cached-random',
    { next: { tags: ['cached-random'] } }
  ).then((res) => res.text())
  return (
    <div>
      <div>
        Cached Random: <span id="cached-random">{cachedRandom}</span>
      </div>
      <div>
        <Link id="navigate-destination" href="/action-discarding/destination">
          Navigate to Destination
        </Link>
      </div>
      {children}
    </div>
  )
}
