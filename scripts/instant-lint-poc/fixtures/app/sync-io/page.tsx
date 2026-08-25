// Expect: SYNC-IO — Date.now() blocks the prerender with no `await` anywhere,
// and neither <Suspense> nor `instant = false` silences it
// (throwIfSyncIOUsed runs before the allowEmptyStaticShell bypass).
export const instant = false

export default function Page() {
  const timestamp = Date.now()
  return <p>Generated at {timestamp}</p>
}
