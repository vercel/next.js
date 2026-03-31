import { connection } from 'next/server'

export default async function Page() {
  await connection()
  return <div id="dynamic-content">Dynamic content</div>
}
