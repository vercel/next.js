import { connection } from 'next/server'
import { QueryDisplay } from './query-display'

/**
 * A dynamic page that does not read searchParams. Its server output depends
 * on nothing in the URL, so it can be kept across a query-only navigation;
 * the client component below still sees the new query.
 */
export default async function Page() {
  await connection()
  return (
    <>
      <p id="server-token">{`Server token: ${Math.random()}`}</p>
      <QueryDisplay />
    </>
  )
}
