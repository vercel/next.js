import { cookies } from 'next/headers'

export { unstable_instant } from './config'

export default async function Page() {
  await cookies()
  return <p>reexport</p>
}
