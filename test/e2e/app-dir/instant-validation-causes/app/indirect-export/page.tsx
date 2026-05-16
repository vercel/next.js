import { cookies } from 'next/headers'

const _instant = true
const instant = _instant
export { instant as unstable_instant }

export default async function Page() {
  await cookies()
  return <p>indirect export</p>
}
