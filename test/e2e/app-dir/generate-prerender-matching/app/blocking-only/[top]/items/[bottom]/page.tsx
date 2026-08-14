export const unstable_matcher = {
  top: 'blocking',
  bottom: 'blocking',
} as const

export function generateStaticParams() {
  return [{ top: 't1', bottom: 'b1' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ top: string; bottom: string }>
}) {
  const { top, bottom } = await params
  return <p id="blocking-only-params">{`${top}/${bottom}`}</p>
}
