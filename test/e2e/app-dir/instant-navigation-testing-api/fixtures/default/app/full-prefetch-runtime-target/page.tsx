import { connection } from 'next/server'

// Identical to full-prefetch-target except for the added runtime-prefetch
// opt-in. A full link prefetch (prefetch={true}) should still resolve the
// dynamic content ahead of navigation, exactly as it does for the sibling
// page without this export.
export const prefetch = 'allow-runtime'

export default async function FullPrefetchRuntimeTargetPage() {
  await connection()

  return (
    <div>
      <h1>Full Prefetch Runtime Target</h1>
      <div data-testid="full-prefetch-runtime-content">
        Full prefetch runtime content loaded
      </div>
    </div>
  )
}
