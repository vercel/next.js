import { draftMode } from 'next/headers'

export default async function DraftModePage() {
  await draftMode()

  return <p>Done draftMode</p>
}
