import { spawnWorker } from '../../../lib/spawn-it'

export function GET() {
  spawnWorker()
  return new Response('ok')
}
