import { readDirect } from './read-direct'

export async function readNested() {
  'use cache'
  return readDirect()
}
