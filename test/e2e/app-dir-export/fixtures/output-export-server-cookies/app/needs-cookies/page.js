import { cookies } from 'next/headers'

export default async function CookiesPage() {
  const cookieStore = await cookies()

  return <h1>{cookieStore.get('theme')?.value}</h1>
}
