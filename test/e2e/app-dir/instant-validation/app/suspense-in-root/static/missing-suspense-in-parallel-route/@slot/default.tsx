export default async function DefaultSlot({ searchParams }) {
  await searchParams
  return (
    <p style={{ color: 'green' }}>
      This is a default parallel slot that awaits searchParams without Suspense
    </p>
  )
}
