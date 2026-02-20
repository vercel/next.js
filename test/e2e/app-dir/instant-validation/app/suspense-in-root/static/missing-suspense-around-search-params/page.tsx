export const unstable_instant = { prefetch: 'static' }

export default async function Page({ searchParams }) {
  const search = await searchParams
  return (
    <main>
      <p>
        This page awaits search params, so it should fail validation. That isn't
        really relevant here, we just need it to fail so that we can assert that
        validation ran.
      </p>
      <div>Search: {JSON.stringify(search)}</div>
    </main>
  )
}
