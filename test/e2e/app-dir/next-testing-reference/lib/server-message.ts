import 'server-only'
import { sum } from './subject'

export async function serverMessage() {
  return `server sum: ${sum([2, 3, 5])}`
}
