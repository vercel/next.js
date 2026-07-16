'use server'

import { redirect } from 'next/navigation'

export async function delayedAction(message: string) {
  await new Promise((resolve) => setTimeout(resolve, 200))
  return message.length
}

export async function progressiveAction() {
  await new Promise((resolve) => setTimeout(resolve, 50))
  redirect('/actions?progressive=done')
}

export async function errorAction() {
  throw new Error('request insights action failure')
}

export default async function defaultAction() {
  return 'default action complete'
}
