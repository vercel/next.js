import { connection } from 'next/server'

export default async function Page() {
  // Keep this page dynamic so a prefetch can never satisfy a navigation to
  // it: every click must issue a dynamic request, which middleware delays by
  // 2s. (The link to this page also sets prefetch={false}; this is the
  // second line of defense for production mode.)
  await connection()
  return <h1 id="slow-page">Slow</h1>
}
