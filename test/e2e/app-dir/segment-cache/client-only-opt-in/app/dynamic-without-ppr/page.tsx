import { connection } from 'next/server'

export default async function DynamicPage() {
  await connection()
  return <div id="dynamic-content">Dynamic Content</div>
}
