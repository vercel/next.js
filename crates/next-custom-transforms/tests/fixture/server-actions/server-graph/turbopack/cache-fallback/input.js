import { used } from './values'
import { unrelated } from './unrelated'

let shared = 0
function helper() {
  return used(shared)
}

export async function state() {
  'use cache'
  return used(shared++)
}

export async function localHelper() {
  'use cache'
  return helper()
}

export async function dynamicImport() {
  'use cache'
  return import('./values')
}

export async function moduleIdentity() {
  'use cache'
  return import.meta.url
}

export function nonCache() {
  return unrelated()
}
