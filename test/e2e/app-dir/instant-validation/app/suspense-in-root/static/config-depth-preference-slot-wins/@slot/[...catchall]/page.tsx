// @slot has NO config but blocks with searchParams. The cause must
// come from the deepest config — @anotherSlot/still/deep/page.tsx,
// not children's shallower catchall config.
export default async function CatchallSlotPage({ searchParams }) {
  await searchParams
  return <p>Slot catchall page — no config, blocks with searchParams</p>
}
