export const unstable_matcher = {
  top: 'blocking',
  bottom: 'dynamic',
} as const

export default async function Page({
  params,
}: {
  params: Promise<{ top: string; bottom: string }>
}) {
  const { top, bottom } = await params
  return <p id="no-example-blocking-params">{`${top}/${bottom}`}</p>
}
