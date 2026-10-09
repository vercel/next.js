'use server'

import { getGeneratorValue } from '../../generator-value'

export async function readCachedValue() {
  return getGeneratorValue('action')
}
