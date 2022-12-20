import { cookies } from 'next/headers'

export default async () => {
  // Don't prerender
  cookies()
  return new Promise<React.ReactNode>(() => {})
}
