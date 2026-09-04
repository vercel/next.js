export const experimental_paramMatching = {
  parts: 'not-found',
} as const

export function generateStaticParams() {
  return [{ parts: [] }, { parts: ['known', 'deep'] }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ lang: string; parts?: string[] }>
}) {
  const { lang, parts = [] } = await params
  return <p id="optional-catch-all">{`${lang}/${parts.join('/')}`}</p>
}
