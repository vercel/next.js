import { slow } from '../../actions'
import { Leaf } from '../../client'

export const dynamic = 'force-dynamic'

export default async function LeafPage() {
  // Stream long enough for the discarded action to settle before the reveal.
  await slow(1200)
  return <Leaf />
}
