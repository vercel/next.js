import { connection } from 'next/server'

// Dynamic, so a partial prefetch only includes the `loading.js` boundary and
// not this content. It has no links, so navigating here starts no prefetches.
export default async function Page() {
  await connection()
  return (
    <div id="prefetch-full-page-destination">Full page destination content</div>
  )
}
