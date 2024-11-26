'use server'

import { expirePath } from 'next/cache'

export async function doAction() {
  expirePath('/en/photos/1/view')
  // sleep 1s
  await new Promise((resolve) => setTimeout(resolve, 1000))
  return Math.random()
}
