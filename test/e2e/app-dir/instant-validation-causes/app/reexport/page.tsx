import { cookies } from 'next/headers'

export { instant } from './config'

export default async function Page() {
  await cookies()
  return <p>reexport</p>
}
