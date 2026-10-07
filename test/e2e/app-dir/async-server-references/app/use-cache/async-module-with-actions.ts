'use server'

import { redirect } from 'next/navigation'

await Promise.resolve() // make this an async module

export async function action() {
  console.log('hello from server! redirecting...')
  redirect('/use-cache/redirect-target')
}
