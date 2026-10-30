'use server'

import { updateTag } from 'next/cache'
import { redirect } from 'next/navigation'

export async function revalidateData(tag: string) {
  updateTag(tag)

  // The redirect renders the page with an embedded runtime prefetch. An
  // ordinary action re-render does not include that prefetch.
  redirect('/handler-handoff')
}
