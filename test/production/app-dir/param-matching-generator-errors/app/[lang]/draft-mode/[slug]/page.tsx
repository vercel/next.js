import { draftMode } from 'next/headers'

export async function experimental_generateParamMatching() {
  await draftMode()
  return { slug: 'blocking' }
}

export default function Page() {
  return <p>draft mode</p>
}
