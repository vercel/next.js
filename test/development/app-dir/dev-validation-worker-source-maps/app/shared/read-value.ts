// import { connection } from 'next/server'

export async function readValue(): Promise<string> {
  // The test uncomments the line below, and the import above, while the dev
  // server runs, so the update lands in a module the page imports.

  // await connection()

  return 'shared'
}
