import { upgrade } from '../shared'

export function GET() {
  return upgrade('shared-b')
}
