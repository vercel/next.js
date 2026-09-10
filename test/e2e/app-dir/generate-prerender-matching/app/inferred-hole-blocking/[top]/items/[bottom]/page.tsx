export const experimental_paramMatching = {
  bottom: 'fallback',
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
  return <p id="inferred-hole-blocking-params">{`${top}/${bottom}`}</p>
}
