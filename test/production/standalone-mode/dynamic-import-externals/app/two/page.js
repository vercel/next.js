import { getQueueValue } from '../../lib/load-external'

export const dynamic = 'force-dynamic'

export default async function Page() {
  return <p>{await getQueueValue()}</p>
}
