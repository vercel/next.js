import { track } from '../../../lib/analytics'
import Chart from './chart'

export const dynamic = 'force-dynamic'

export default function Dashboard() {
  return <Chart onEvent={track} />
}
