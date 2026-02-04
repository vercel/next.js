'use server'

import { notFound, redirect } from 'next/navigation'

export async function redirectAction() {
  redirect('/another')
}

export async function notFoundAction() {
  notFound()
}
