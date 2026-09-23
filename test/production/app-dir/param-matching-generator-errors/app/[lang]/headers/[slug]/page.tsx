import { headers } from 'next/headers'

export async function unstable_generateParamMatching() {
  await headers()
  return { slug: 'blocking' }
}

export default function Page() {
  return <p>headers</p>
}
