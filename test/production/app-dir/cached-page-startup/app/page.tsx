import { draftMode } from 'next/headers'

export default async function Page() {
  const { isEnabled } = await draftMode()
  return (
    <>
      <p id="rendered-at">{Date.now()}</p>
      <p id="draft">{String(isEnabled)}</p>
    </>
  )
}
