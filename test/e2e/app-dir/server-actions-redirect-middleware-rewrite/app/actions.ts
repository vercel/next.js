'use server'

import { redirect } from 'next/navigation'

export async function relativeRedirect() {
  return redirect('./subpage')
}

export async function absoluteRedirect() {
  return redirect('/subpage')
}
