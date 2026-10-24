export const instant = {
  level: 'experimental-error',
  unstable_samples: [{ params: { top: '日本', bottom: 'novel' } }],
}

export function generateStaticParams() {
  return [{ top: 'short' }, { top: '日本', bottom: 'example' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ top: string; bottom: string }>
}) {
  const { top, bottom } = await params
  return <p>{`${top}/${bottom}`}</p>
}
