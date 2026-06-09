import { cookies } from 'next/headers'

const _instant = true
const instantConfig = _instant
export { instantConfig as instant }

export default async function Page() {
  await cookies()
  return <p>indirect export</p>
}
