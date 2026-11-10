import { draftMode } from 'next/headers'

export default function Page() {
  return <p>draft-mode</p>
}

export async function generateStaticParams() {
  await draftMode()
  return [{ slug: 'test' }]
}
