import { draftMode } from 'next/headers'
import { Links } from './links'

export default async function Page() {
  const { isEnabled } = await draftMode()

  return (
    <>
      <h1>Edge page</h1>
      <p id="draft-mode">
        {`Draft mode: ${isEnabled ? 'enabled' : 'disabled'}`}
      </p>
      <Links />
    </>
  )
}
