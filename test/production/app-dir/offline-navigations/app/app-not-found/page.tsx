import { notFound } from 'next/navigation'
import { connection } from 'next/server'

export const unstable_instant = false
export const unstable_prefetch = 'force-disabled'

export default async function AppNotFoundPage(): Promise<never> {
  await connection()
  notFound()
}
