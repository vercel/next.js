import * as features from '../../lib/features'

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ index?: string }>
}) {
  const { index } = await searchParams
  return <p>{features.feature0(Number(index ?? 0))}</p>
}
