import { unstable_noStore as noStore } from 'next/cache'

export default async function Delayed({
  ms,
  postpone,
}: {
  ms: number
  postpone?: boolean
}) {
  if (postpone) {
    noStore()
  }

  await new Promise((resolve) => setTimeout(resolve, ms))

  return <p>delayed world ({ms})</p>
}
