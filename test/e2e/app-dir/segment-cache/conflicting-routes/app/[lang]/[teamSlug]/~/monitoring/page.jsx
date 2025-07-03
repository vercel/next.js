import { connection } from 'next/server'

export default async function Page() {
  await connection()

  return <div>/[lang]/[teamSlug]/~/monitoring</div>
}
