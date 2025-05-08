import { connection } from 'next/server'

console.log('global-side-effect:app-router-page')

export default async function Page() {
  await connection()
  return <p>hello world</p>
}
