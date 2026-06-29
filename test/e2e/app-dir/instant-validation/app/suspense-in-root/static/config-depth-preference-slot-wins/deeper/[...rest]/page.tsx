// Children's config via catchall — shallower than @anotherSlot's
// deep config. Should NOT be preferred as root cause.
export const instant = { level: 'experimental-error' }

export default function ChildrenCatchallPage() {
  return (
    <main>
      <p>Children catchall page — shallow config, no blocking</p>
    </main>
  )
}
