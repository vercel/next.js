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
  // split would put them all on one worker.
  const ms = Number(id) >= 40 ? 300 : 5
  await new Promise((resolve) => setTimeout(resolve, ms))
  return <p id="item">item {id}</p>
}
