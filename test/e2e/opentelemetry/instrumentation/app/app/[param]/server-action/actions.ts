'use server'

import { notFound, redirect } from 'next/navigation'

export async function exportedServerAction(formData: FormData) {
  void formData.get('private-action-value')
}

export default async function defaultServerAction() {}

export async function throwingServerAction() {
  throw new Error('server action failed')
}

export async function rejectingNonErrorServerAction() {
  return Promise.reject('private-thrown-value')
}

export async function redirectingServerAction() {
  redirect('/app/param/server-action?redirected=1')
}

export async function notFoundServerAction() {
  notFound()
}
