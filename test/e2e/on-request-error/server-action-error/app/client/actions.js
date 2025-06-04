'use server'

import { notFound, redirect } from 'next/navigation'

export async function redirectAction() {
  redirect('/another')
}

export async function notFoundAction() {
  notFound()
}

export async function serverLog(content) {
  throw new Error('[server-action]:' + content)
}
