'use server'

import { unstable_cacheDurable } from 'next/cache'

export async function action() {
  unstable_cacheDurable()
}
