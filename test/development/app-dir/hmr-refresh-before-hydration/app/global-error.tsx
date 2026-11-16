'use client'

// The test stalls the script chunk that contains this marker. The initial
// Flight payload references this component as a value (the global error
// component), which blocks the payload from resolving until the chunk has
// loaded, so the App Router can't initialize until the test releases it.
// Must match `GATE_MARKER` in the test.
const GATE_MARKER = '__hmr_refresh_before_hydration_gate__'

export default function GlobalError() {
  return (
    <html>
      <body>
        <p data-marker={GATE_MARKER}>global error</p>
      </body>
    </html>
  )
}
