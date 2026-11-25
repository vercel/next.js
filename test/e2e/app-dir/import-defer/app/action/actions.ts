'use server'

import defer * as data from '../../lib/server-data'
import defer * as neverAccessed from '../../lib/throws-on-evaluation'

export async function getDeferredValue() {
  return data.getValue()
}

export async function neverCalled() {
  return neverAccessed.value
}
