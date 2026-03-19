// Deepest config — in @anotherSlot, deeper than children's catchall.
// Should be preferred as the root cause because depth wins.
export const unstable_instant = { prefetch: 'static' }

export default function AnotherSlotDeepPage() {
  return <p>Another slot deep page — deepest config, no blocking</p>
}
