import { draftMode } from 'next/headers'

export default function PreviewPage() {
  const { isEnabled } = draftMode()
  return <h1>{isEnabled ? 'draft' : 'none'}</h1>
}
