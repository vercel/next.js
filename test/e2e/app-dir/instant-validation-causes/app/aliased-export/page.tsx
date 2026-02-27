import { cookies } from 'next/headers'

const instant = { prefetch: 'static' }
export { instant as unstable_instant }

export default async function Page() {
  await cookies()
  return <p>aliased export</p>
}
