import { connection } from 'next/server'

export async function experimental_generateParamMatching() {
  await connection()
  return { slug: 'blocking' }
}

export default function Page() {
  return <p>connection</p>
}
