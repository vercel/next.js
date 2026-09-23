import { cookies } from 'next/headers'

export async function experimental_generateParamMatching() {
  await cookies()
  return { slug: 'blocking' }
}

export default function Page() {
  return <p>cookies</p>
}
