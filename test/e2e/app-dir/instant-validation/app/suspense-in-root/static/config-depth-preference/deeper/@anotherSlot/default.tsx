// Shallow config in a named slot. The deeper config in the children slot's
// still/deep/page.tsx should be preferred over this one.
export const instant = { level: 'experimental-error' }

export default function AnotherSlotDefault() {
  return <p>Another slot default — shallow config, no blocking</p>
}
