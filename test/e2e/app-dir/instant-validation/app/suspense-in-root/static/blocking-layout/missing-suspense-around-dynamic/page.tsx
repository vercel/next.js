export const instant = { level: 'experimental-error' }

export default async function Page({ searchParams }) {
  await searchParams
  return (
    <main>
      This is a page that uses runtime data without a suspense, so it should
      error the static prefetch assertion even if nested under a
      allowed-blocking layout
    </main>
  )
}
