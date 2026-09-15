'use server'

import { updateSessionSummary } from '@/lib/sessions'

export async function saveSessionSummary(formData: FormData) {
  const slug = String(formData.get('slug'))
  const summary = String(formData.get('summary'))

  await updateSessionSummary(slug, summary)
}
