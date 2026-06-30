export default async function IndexSlot({ searchParams }) {
  await searchParams
  return (
    <p style={{ color: 'blue' }}>
      This is a parallel layout slot that awaits searchParams without Suspense
    </p>
  )
}
