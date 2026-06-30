export default async function FooSlot({ searchParams }) {
  await searchParams
  return (
    <p style={{ color: 'tomato' }}>
      This is a different parallel layout slot that awaits searchParams without
      Suspense
    </p>
  )
}
