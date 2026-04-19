'use server'

import { notFound } from 'next/navigation'

export async function actionNotFound() {
  return notFound()
}
