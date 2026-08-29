'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { addTicket } from './tickets'

export async function createTicket(formData: FormData) {
  const body = String(formData.get('body') ?? '').trim()
  if (body.length > 0) {
    addTicket(body)
    // The list must reflect the new ticket immediately after submitting.
    revalidatePath('/tickets')
  }
  redirect('/tickets')
}
