// @slot has NO config but blocks with searchParams. The cause must
// come from the children slot's configs. The deepest config
// (still/deep/page.tsx) should be preferred over the shallower
// one (@anotherSlot/page.tsx).
export default async function CatchallSlotPage({ searchParams }) {
  await searchParams
  return <p>Slot catchall page — no config, blocks with searchParams</p>
}
