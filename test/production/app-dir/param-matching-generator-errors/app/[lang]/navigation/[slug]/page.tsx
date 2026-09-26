import { unstable_navigation } from 'next/cache'

export async function unstable_generateParamMatching() {
  await unstable_navigation()
  return { slug: 'blocking' }
}

export default function Page() {
  return <p>navigation</p>
}
