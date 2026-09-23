export const experimental_paramMatching = {
  bottom: 'fallback',
} as const

export default async function Page({
  params,
}: {
  params: Promise<{ top: string; bottom: string }>
}) {
  const { top, bottom } = await params
  return <p>{`${top}/${bottom}`}</p>
}
