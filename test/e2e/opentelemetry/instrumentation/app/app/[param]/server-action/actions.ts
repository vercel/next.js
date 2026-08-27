'use server'

import { notFound, redirect } from 'next/navigation'

export async function exportedServerAction() {}

export async function redirectServerAction() {
  redirect('/app/param/server-action')
}

export async function notFoundServerAction() {
  notFound()
}

export async function failingServerAction() {
  throw new Error('private Server Action failure')
}
