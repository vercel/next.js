import { revalidateTag } from 'next/cache'
import { setValue } from '../../../lib/state'

// Control: the same mutation and revalidateTag call, but before the Response is
// returned from the Route Handler.
export async function POST() {
  setValue(3)
  revalidateTag('same-tag', { expire: 0 })
  return Response.json({ ok: true })
}
