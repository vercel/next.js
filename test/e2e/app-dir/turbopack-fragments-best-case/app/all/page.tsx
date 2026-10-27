import * as features from '../../lib/features'

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ index?: string }>
}) {
  const { index } = await searchParams
  return (
    <p>
      {Object.values(features)
        .map((fn) => fn(Number(index ?? 0)))
        .join('|')}
    </p>
  )
}
