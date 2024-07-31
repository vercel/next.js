'use server'

import { forbidden, notFound, redirect } from 'next/navigation'

export async function redirectAction() {
  redirect('/another')
}

export async function notFoundAction() {
  notFound()
}

export async function forbiddenAction() {
  forbidden()
}
