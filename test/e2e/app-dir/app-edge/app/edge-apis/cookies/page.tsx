import { cookies } from 'next/headers'

export const runtime = 'edge'

export default async function Page() {
  await cookies()
  return <h1>Hello!</h1>
}
