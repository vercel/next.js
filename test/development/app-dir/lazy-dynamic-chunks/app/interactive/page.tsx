import { InteractiveDemo } from './demo'

// This route owns the click-driven materialization case, on its own target module so it cannot
// disturb the compile-only assertions on `/`.
export default function InteractivePage() {
  return (
    <main>
      <InteractiveDemo />
    </main>
  )
}
