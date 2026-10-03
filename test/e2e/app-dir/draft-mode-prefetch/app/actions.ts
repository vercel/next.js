'use server'

import { draftMode } from 'next/headers'
import { redirect } from 'next/navigation'

export async function enableDraftMode() {
  const draft = await draftMode()
  draft.enable()
}

export async function disableDraftMode() {
  const draft = await draftMode()
  draft.disable()
}

export async function enableDraftModeAndRedirect() {
  const draft = await draftMode()
  draft.enable()
  redirect('/article/redirect')
}

export async function unrelatedAction() {
  return 'Unrelated action done'
}
