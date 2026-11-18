import { unstable_cacheDurable } from 'next/cache'

export async function cached() {
  'use cache: remote'
  unstable_cacheDurable()
}

export async function defaultCache() {
  'use cache'
  unstable_cacheDurable()
}

export async function action() {
  'use server'
  unstable_cacheDurable()
}
