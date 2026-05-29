import { cookies } from 'next/headers'

export default async function CookiesPage() {
  await cookies()

  return <p>Done cookies</p>
}
