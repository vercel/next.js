import { cookies } from 'next/headers'

export async function readCookie(): Promise<string> {
  const store = await cookies()
  return store.get('probe')?.value ?? 'none'
}
