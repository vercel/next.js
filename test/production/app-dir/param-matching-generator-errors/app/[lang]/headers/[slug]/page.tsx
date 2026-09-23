import { headers } from 'next/headers'

export async function experimental_generateParamMatching() {
  await headers()
  return { slug: 'blocking' }
}

export default function Page() {
  return <p>headers</p>
}
