'use server'

import { cookies } from 'next/headers'
import { refresh } from 'next/cache'
import { redirect } from 'next/navigation'

export async function addTodoEntry(entry: string) {
  // simulate some latency
  await new Promise((resolve) => setTimeout(resolve, 500))

  const cookieStore = await cookies()
  const existing = cookieStore.get('todo-entries')?.value || '[]'
  const entries = JSON.parse(existing)
  entries.push(entry)
  cookieStore.set('todo-entries', JSON.stringify(entries))
}

export async function getTodoEntries() {
  const cookieStore = await cookies()
  const existing = cookieStore.get('todo-entries')?.value || '[]'
  return JSON.parse(existing) as string[]
}

export async function addEntryAndRefresh(formData: FormData) {
  const entry = formData.get('entry') as string

  await addTodoEntry(entry)

  refresh()
  redirect('/redirect-and-refresh/foo')
}
