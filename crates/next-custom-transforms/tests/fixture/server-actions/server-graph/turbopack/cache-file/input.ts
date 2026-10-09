'use cache'

import { first, second } from './values'

export async function one(value: string): Promise<string> {
  return first(value)
}

export default async function two() {
  return second()
}
