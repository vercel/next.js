// Expect: BLOCKING-ALLOWED — the segment blocks, but `instant = false`
// explicitly allows it, so no error is reported (matching
// isPageAllowedToBlock / allowEmptyStaticShell in the runtime).
export const instant = false

export default async function Page() {
  const res = await fetch('https://api.example.com/report')
  const report = await res.json()
  return <pre>{JSON.stringify(report)}</pre>
}
