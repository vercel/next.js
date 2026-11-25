// Imports `lib/dyn.ts` both directly and from `lib/wrap.ts`, so the route's
// chunks have two variants of its async loader.
export default async function Page() {
  const { value } = await import('../../lib/dyn')
  const { viaWrap } = await import('../../lib/wrap')
  return <p id="value">{`${value}|${await viaWrap()}`}</p>
}
