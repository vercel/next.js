import { after } from 'next/server'
import { draftMode } from 'next/headers'

export function testDraftMode(/** @type {string} */ route) {
  after(async () => {
    const draft = await draftMode()
    try {
      console.log(`[${route}] draft.isEnabled: ${draft.isEnabled}`)
    } catch (err) {
      console.error(err)
    }
  })

  after(async () => {
    const draft = await draftMode()
    try {
      draft.enable()
    } catch (err) {
      console.error(err)
    }
  })

  after(async () => {
    const draft = await draftMode()
    try {
      draft.disable()
    } catch (err) {
      console.error(err)
    }
  })
}
