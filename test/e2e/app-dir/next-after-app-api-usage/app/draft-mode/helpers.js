import { createLogger } from '../log'
import { after } from 'next/server'
import { draftMode } from 'next/headers'

export function testDraftMode(
  /** @type {string} */ route,
  /** @type {string | undefined} */ requestId
) {
  const log = createLogger(requestId, 3)
  after(async () => {
    const draft = await draftMode()
    try {
      log(`[${route}] draft.isEnabled: ${draft.isEnabled}`)
    } catch (err) {
      log(err)
    }
  })

  after(async () => {
    const draft = await draftMode()
    try {
      draft.enable()
    } catch (err) {
      log(err)
    }
  })

  after(async () => {
    const draft = await draftMode()
    try {
      draft.disable()
    } catch (err) {
      log(err)
    }
  })
}
