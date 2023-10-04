'use server'

import { revalidatePath } from 'next/cache'
import { createEntry } from '@/lib/fauna'

export async function createEntryAction(prevState, formData) {
  const name = formData.get('name')
  const message = formData.get('message')
  try {
    await createEntry(name, message)
    revalidatePath('/')
    return {
      successMessage: 'Thank you for signing the guest book',
      errorMessage: null,
    }
  } catch (error) {
    return {
      successMessage: null,
      errorMessage: 'Something went wrong. Please try again',
    }
  }
}
