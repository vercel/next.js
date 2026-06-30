// @slot has NO instant config but awaits searchParams without Suspense.
// This blocks the navigation, violating the instant config that's
// deep in the children slot (inner/deep/page.tsx) behind a second
// fork point. The cause should fall back to the root config.
export default async function CatchallSlotPage({ searchParams }) {
  await searchParams
  return <p>Slot catchall page — blocks with searchParams, no config</p>
}
