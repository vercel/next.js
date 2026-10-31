import { startWorker } from 'worker-pkg'
import { receiveMessage } from '../../receive-message'

export const dynamic = 'force-dynamic'

export function GET() {
  return receiveMessage(startWorker())
}
