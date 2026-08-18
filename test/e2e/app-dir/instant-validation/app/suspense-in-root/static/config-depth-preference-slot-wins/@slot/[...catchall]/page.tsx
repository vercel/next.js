import { cookies } from 'next/headers'

// @slot has NO config but blocks with cookies(). The cause must
// come from the deepest config — @anotherSlot/still/deep/page.tsx,
// not children's shallower catchall config.
export default async function CatchallSlotPage() {
  await cookies()
  return <p>Slot catchall page — no config, blocks with cookies()</p>
}
