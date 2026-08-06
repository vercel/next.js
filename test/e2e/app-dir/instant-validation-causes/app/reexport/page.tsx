import { connection } from 'next/server'

export { instant } from './config'

export default async function Page() {
  await connection()
  return <p>reexport</p>
}
