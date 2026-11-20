const COUNT = 60

export function generateStaticParams() {
  return Array.from({ length: COUNT }, (_, i) => ({ id: String(i) }))
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  // Pages 40-59 are slow and sit next to each other at the end, so a static
  // split would put them all on one worker. Do CPU work instead of awaiting a
  // timer or reading the clock, so the page also prerenders with Cache
  // Components.
  let checksum = 0
  const iterations = Number(id) >= 40 ? 20_000_000 : 10_000
  for (let i = 0; i < iterations; i++) checksum = (checksum * 31 + i) | 0
  return (
    <p id="item" data-checksum={checksum}>
      item {id}
    </p>
  )
}
