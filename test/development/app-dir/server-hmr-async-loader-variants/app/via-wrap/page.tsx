// Changes whenever this page module is evaluated again.
const evaluatedAt = `${Date.now()}-${Math.random()}`

// Only imports `lib/dyn.ts` from `lib/wrap.ts`, so the route has a different
// variant of its async loader than `/direct`.
export default async function Page() {
  const { viaWrap } = await import('../../lib/wrap')
  return (
    <>
      <p id="value">{await viaWrap()}</p>
      <p id="evaluated-at">{evaluatedAt}</p>
    </>
  )
}
