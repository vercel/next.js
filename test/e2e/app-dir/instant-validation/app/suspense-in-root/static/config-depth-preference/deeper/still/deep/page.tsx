// Deepest config — should be preferred as the root cause when
// the error is in @slot (which has no config).
export const unstable_instant = { level: 'experimental-error' }

export default function Page() {
  return (
    <main>
      <p>Deepest children page — deep config, no blocking</p>
    </main>
  )
}
