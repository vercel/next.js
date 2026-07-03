import { cookies } from 'next/headers'

export default async function Page() {
  const cookieStore = await cookies()
  return <p>{cookieStore.get('token')?.value ?? 'no token'}</p>
}
