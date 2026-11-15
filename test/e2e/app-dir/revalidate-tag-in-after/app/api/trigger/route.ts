import { revalidateTag } from 'next/cache'
import { after } from 'next/server'
import { prepareRelease, setValue } from '../../../lib/state'

export async function POST() {
  const released = prepareRelease()
  revalidateTag('same-tag', { expire: 0 })
  after(async () => {
    await released
    setValue(2)
    revalidateTag('same-tag', { expire: 0 })
  })
  return Response.json({ ok: true })
}
