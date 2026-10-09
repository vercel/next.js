export const instant = { level: 'experimental-error' }

export default async function Page() {
  const { default: Client } = await import('./client')
  return (
    <main>
      <Client />
    </main>
  )
}
