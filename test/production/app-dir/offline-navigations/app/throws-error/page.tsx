import { connection } from 'next/server'

export const unstable_instant = false
export const unstable_prefetch = 'force-disabled'

export default async function ThrowsErrorPage(): Promise<never> {
  await connection()
  throw new Error('offline navigation thrown page error')
}
