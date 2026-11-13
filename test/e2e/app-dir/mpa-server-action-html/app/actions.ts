'use server'

import { cookies } from 'next/headers'
import { updateTag } from 'next/cache'
import { notFound } from 'next/navigation'

export type FormState = { count: number; message: string }

export async function submitState(
  name: string,
  previous: FormState,
  data: FormData
): Promise<FormState> {
  return {
    count: previous.count + 1,
    message: `${name}:${data.get('message')}`,
  }
}

export async function invalidateState(previous: FormState, data: FormData) {
  updateTag('mpa-content')
  return submitState('invalidate', previous, data)
}

export async function submitPlain(prefix: string, data: FormData) {
  const cookieStore = await cookies()
  cookieStore.set('mpa-message', `${prefix}:${data.get('message')}`)
}

export async function submitNotFound() {
  notFound()
}
