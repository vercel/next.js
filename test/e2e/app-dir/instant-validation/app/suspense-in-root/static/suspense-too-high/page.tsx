export const instant = { level: 'experimental-error' }

export default async function Page({ searchParams }) {
  await searchParams
  return (
    <main>
      <p>This page blocks when navigating inside the parent layout</p>
    </main>
  )
}
