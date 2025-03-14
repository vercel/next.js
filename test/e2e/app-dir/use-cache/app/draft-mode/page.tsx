'use cache'

import { draftMode } from 'next/headers'
import { Button } from './button'

export default async function Page() {
  const offset = 1000

  const cachedClosure = async () => {
    'use cache'
    return new Date(Date.now() + offset).toISOString()
  }

  const { isEnabled } = await draftMode()

  return (
    <form
      action={async () => {
        'use server'
        const draft = await draftMode()
        if (draft.isEnabled) {
          draft.disable()
        } else {
          draft.enable()
        }
      }}
    >
      <p id="top-level">{new Date().toISOString()}</p>
      <p id="closure">{await cachedClosure()}</p>
      <Button id="toggle">{isEnabled ? 'Disable' : 'Enable'} Draft Mode</Button>
    </form>
  )
}
