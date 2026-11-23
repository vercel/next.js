// Changes whenever this page module is evaluated again.
const evaluatedAt = `${Date.now()}-${Math.random()}`

// Imports `lib/dyn.ts` where `lib/dep.ts` isn't available yet, so its async
// loader also loads the chunk of `lib/dep.ts`.
export default async function Page() {
  const { value } = await import('../../lib/dyn')
  return (
    <>
      <p id="value">{value}</p>
      <p id="evaluated-at">{evaluatedAt}</p>
    </>
  )
}
