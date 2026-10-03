import { cookies } from 'next/headers'

export const instant = false

export default async function Page() {
  await cookies()
  return <p>empty blocking shell</p>
}
