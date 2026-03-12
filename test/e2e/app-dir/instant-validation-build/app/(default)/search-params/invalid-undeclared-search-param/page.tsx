import { ensureThrows } from '../../../../ensure-error'

export const unstable_instant = {
  prefetch: 'runtime',
  samples: [{ searchParams: { q: 'test' } }],
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; undeclared?: string }>
}) {
  return (
    <main>
      <p>
        This page reads a searchParam that is not declared in the sample, so it
        should fail validation with an exhaustiveness error.
      </p>
      <SearchResult searchParams={searchParams} />
    </main>
  )
}

async function SearchResult({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; undeclared?: string }>
}) {
  const sp = await searchParams
  ensureThrows(
    () => sp.undeclared,
    `Expected accessing an undeclared search param to throw`
  )
  return null
}
