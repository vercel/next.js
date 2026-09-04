import { PolicyPage } from '../../policy-page'

export const experimental_paramMatching = {
  slug: 'fallback',
} as const

export function generateStaticParams() {
  return [{ slug: 'seed' }]
}

export default function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return <PolicyPage params={params} policy="fallback" />
}
