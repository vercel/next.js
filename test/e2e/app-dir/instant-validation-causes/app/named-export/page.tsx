import { cookies } from 'next/headers'

const unstable_instant = true
export { unstable_instant }

export default async function Page() {
  await cookies()
  return <p>named export</p>
}
