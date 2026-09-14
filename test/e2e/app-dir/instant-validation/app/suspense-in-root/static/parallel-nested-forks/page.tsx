import { cookies } from 'next/headers'

export const instant = { level: 'experimental-error' }

export default async function Page() {
  await cookies()
  return (
    <main>
      <p>Children page — blocks with cookies()</p>
    </main>
  )
}
