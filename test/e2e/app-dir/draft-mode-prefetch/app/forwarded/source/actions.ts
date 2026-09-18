'use server'

import { draftMode, headers } from 'next/headers'
import { redirect } from 'next/navigation'

export async function enableDraftMode() {
  await assertForwarded()
  const draft = await draftMode()
  draft.enable()
}

export async function disableDraftMode() {
  await assertForwarded()
  const draft = await draftMode()
  draft.disable()
}

export async function enableDraftModeAndRedirect() {
  await assertForwarded()
  const draft = await draftMode()
  draft.enable()
  redirect('/article/forwarded-redirect')
}

async function assertForwarded() {
  if ((await headers()).get('x-action-forwarded') !== '1') {
    throw new Error('Expected this action to run on the forwarded worker')
  }
}
