import { getCountryCode } from './root-helper'

export async function readTransitive() {
  'use cache'
  return getCountryCode()
}
