'use server'

import { redirect } from 'next/navigation'
import { addTicket } from './tickets'

export async function createTicket(formData: FormData) {
  const body = String(formData.get('body') ?? '').trim()
  if (body.length > 0) {
    addTicket(body)
  }
  redirect('/tickets')
}
