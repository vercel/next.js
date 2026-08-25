// Expect: REMOVE-INSTANT-FALSE — nothing here blocks, so the blanket opt-out
// (e.g. left behind by the cache-components-instant-false migration codemod)
// only disables validation. The analyzer suggests removing it.
export const instant = false

export default function Page() {
  return <h1>Entirely static content</h1>
}
