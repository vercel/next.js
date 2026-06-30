// @slot has NO config but blocks. The root config should be
// children's config (not some other named slot's) because
// children is preferred at equal depth.
export default async function SlotPage({ searchParams }) {
  await searchParams
  return <p>Slot page — no config, blocks with searchParams</p>
}
