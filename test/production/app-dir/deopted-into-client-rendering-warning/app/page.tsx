import { cookies } from 'next/headers'
export default async function Home() {
  await cookies()
  return null
}
