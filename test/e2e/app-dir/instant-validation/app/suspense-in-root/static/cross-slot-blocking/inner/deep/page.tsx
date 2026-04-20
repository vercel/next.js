// The instant config is deep in the children slot, behind a
// second fork point (inner/layout.tsx has @panel). The blocking
// code is in @slot at the outer fork. The slot marker for @slot
// has no config, so the cause must fall back to the root config.
export const unstable_instant = true

export default function Page() {
  return (
    <main>
      <p>Deep children page with instant config (does not block)</p>
    </main>
  )
}
