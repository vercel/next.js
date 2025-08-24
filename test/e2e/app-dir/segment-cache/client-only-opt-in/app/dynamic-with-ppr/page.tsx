import { connection } from 'next/server'

export const experimental_ppr = true

export default async function DynamicPage() {
  await connection()
  return <div id="dynamic-content">Dynamic Content</div>
}
