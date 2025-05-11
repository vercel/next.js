'use server'

import { setTimeout } from 'timers/promises'

export async function myAction(id: number) {
  console.log(`myAction(${id}) :: server`)
  await setTimeout(100)
}
