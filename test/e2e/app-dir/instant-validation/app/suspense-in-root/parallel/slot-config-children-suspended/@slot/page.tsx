export const unstable_instant = { level: 'experimental-error' }

export default function SlotPage() {
  return (
    <p style={{ color: 'blue' }}>
      This is a parallel slot page with unstable_instant (static)
    </p>
  )
}
