'use server'

import { incrementActionCount } from './state'

export async function action() {
  return String(incrementActionCount())
}
