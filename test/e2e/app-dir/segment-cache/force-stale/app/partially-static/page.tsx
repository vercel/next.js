import { connection } from 'next/server'

export default async function Page() {
  await connection()
  return <div id="partially-static-page">Partially static page content</div>
}
