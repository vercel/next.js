import { language } from './root-reexport'

export async function readAlias() {
  'use cache'
  return language()
}
