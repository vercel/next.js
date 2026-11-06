'use cache'

import { unstable_cacheDurable } from 'next/cache'

async function helper() {
  unstable_cacheDurable()
  return 'helper'
}

export async function cached() {
  return helper()
}

export const expression = async () => unstable_cacheDurable()
