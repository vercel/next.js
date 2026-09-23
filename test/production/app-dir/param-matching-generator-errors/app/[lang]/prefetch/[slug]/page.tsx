import { unstable_prefetch } from 'next/cache'

export async function experimental_generateParamMatching() {
  await unstable_prefetch()
  return { slug: 'blocking' }
}

export default function Page() {
  return <p>prefetch</p>
}
