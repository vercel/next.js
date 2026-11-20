'use server'

import { refresh } from 'next/cache'
import { draftMode } from 'next/headers'

export async function setDraftMode(isEnabled: boolean) {
  const draftModeState = await draftMode()
  if (isEnabled) {
    draftModeState.enable()
  } else {
    draftModeState.disable()
  }
  refresh()
}
