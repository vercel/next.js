import { connection } from 'next/server'

export default async function Page() {
  await connection()
  // Keep the page data behind the prefetch response so the test can observe
  // the commit that happens when an in-flight prefetch resolves empty.
  await new Promise((resolve) => setTimeout(resolve, 1500))
  return <article id="item-page">Item page</article>
}
