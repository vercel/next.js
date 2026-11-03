export const unstable_paramMatching = {
  top: 'fallback',
  bottom: 'fallback',
} as const

export const instant = {
  level: 'experimental-error',
  unstable_samples: [{ params: { top: 'known', bottom: 'example' } }],
}

export function generateStaticParams() {
  return [{ top: 'known', bottom: 'example' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ top: string; bottom: string }>
}) {
  const { top, bottom } = await params
  return <p>{`${top}/${bottom}`}</p>
}
