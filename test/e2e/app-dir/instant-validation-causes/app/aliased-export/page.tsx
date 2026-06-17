import { cookies } from 'next/headers'

const instantConfig = true
export { instantConfig as instant }

export default async function Page() {
  await cookies()
  return <p>aliased export</p>
}
