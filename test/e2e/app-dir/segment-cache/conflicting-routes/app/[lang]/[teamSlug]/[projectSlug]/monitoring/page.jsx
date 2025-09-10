import { connection } from 'next/server'

export default async function Page() {
  await connection()

  return <div>/[lang]/[teamSlug]/[projectSlug]/monitoring</div>
}

export const experimental_ppr = true
