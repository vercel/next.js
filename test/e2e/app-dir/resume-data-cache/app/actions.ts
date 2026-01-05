'use server'

import { refresh } from 'next/cache'

export async function refreshAction() {
  // Simulate some IO before calling refresh
  await new Promise((resolve) => setTimeout(resolve, 100))
  refresh()
}
