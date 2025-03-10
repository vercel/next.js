import { draftMode } from 'next/headers'

export default async function PreviewPage() {
  const { isEnabled } = await draftMode()
  return <h1>{isEnabled ? 'draft' : 'none'}</h1>
}
