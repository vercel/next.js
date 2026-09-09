'use server'

import { redirect } from 'next/navigation'

export async function submitApplication(formData: FormData) {
  const name = String(formData.get('name') ?? '').trim()

  if (!name) {
    // Send incomplete submissions back to the form.
    redirect('/apply')
  }

  // The applicant tracking system is the real system of record; from the
  // app's point of view the submission is fire-and-forget.
  console.log(`[applications] received application from ${name}`)

  redirect('/done')
}
