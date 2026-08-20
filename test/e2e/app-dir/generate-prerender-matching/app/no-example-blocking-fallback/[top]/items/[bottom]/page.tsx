export const instant = false

export const experimental_paramMatching = {
  top: 'blocking',
  bottom: 'fallback',
} as const

export default async function Page({
  params,
}: {
  params: Promise<{ top: string; bottom: string }>
}) {
  const { top, bottom } = await params
  return <p id="no-example-blocking-fallback-params">{`${top}/${bottom}`}</p>
}
