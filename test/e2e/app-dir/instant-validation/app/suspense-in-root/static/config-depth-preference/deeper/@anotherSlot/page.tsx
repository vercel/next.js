// Shallow config in a named slot. The deeper config in
// still/deep/page.tsx should be preferred over this one.
export const unstable_instant = { level: 'experimental-error' }

export default function AnotherSlotPage() {
  return <p>Another slot page — shallow config, no blocking</p>
}
