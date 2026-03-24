import { cookies } from 'next/headers'

// @slot has NO config but blocks with cookies(). The cause must
// come from the children slot's configs. The deepest config
// (still/deep/page.tsx) should be preferred over the shallower
// one (@anotherSlot/page.tsx).
export default async function CatchallSlotPage() {
  await cookies()
  return <p>Slot catchall page — no config, blocks with cookies()</p>
}
