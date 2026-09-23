import { cookies } from 'next/headers'

export async function unstable_generateParamMatching() {
  await cookies()
  return { slug: 'blocking' }
}

export default function Page() {
  return <p>cookies</p>
}
