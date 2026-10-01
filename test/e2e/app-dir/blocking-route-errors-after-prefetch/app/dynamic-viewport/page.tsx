import { redirect } from 'next/navigation'
import { connection } from 'next/server'

// The viewport blocks the navigation, too, so the prefetched head can't be
// rendered to completion either.
export async function generateViewport() {
  await connection()
  return { themeColor: 'black' }
}

export default async function Page(): Promise<never> {
  await connection()
  redirect('/destination')
}
