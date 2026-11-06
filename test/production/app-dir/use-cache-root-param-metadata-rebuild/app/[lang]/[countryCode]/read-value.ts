import { getValue } from './helper'

export async function readValue() {
  'use cache'
  return getValue()
}
