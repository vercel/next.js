import { cookies } from 'next/headers'

const instant = true
export { instant }

export default async function Page() {
  await cookies()
  return <p>named export</p>
}
