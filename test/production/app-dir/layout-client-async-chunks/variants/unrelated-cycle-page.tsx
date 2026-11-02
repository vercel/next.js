import { track } from '../../../lib/analytics'
import Chart from './chart'

export const dynamic = 'force-dynamic'

export default function Dashboard() {
  // This async cycle has no importer path back to the root layout.
  void import('../../../lib/unrelated-a')
  return <Chart onEvent={track} />
}
