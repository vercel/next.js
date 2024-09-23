'use server'

import { HelloClient } from './hello-client'

export async function action() {
  return <HelloClient />
}
