import { getStaticParams } from './get-static-params'

export const unstable_paramMatching = { slug: 'not-found' } as const

export async function generateStaticParams() {
  return getStaticParams()
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return <p>{slug}</p>
}
