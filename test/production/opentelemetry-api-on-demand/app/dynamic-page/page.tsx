import { connection } from 'next/server'

export default async function Page() {
  // Opt out of prerendering, so that a request renders the page.
  await connection()

  return <p>hello app router</p>
}
