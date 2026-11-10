export default async function Page() {
  const { multiAUsed } = await import('../../lib/multi-module-a')
  const { multiBUsed } = await import('../../lib/multi-module-b')
  return (
    <div>
      {multiAUsed()} {multiBUsed()}
    </div>
  )
}
