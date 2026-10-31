import { permanentRedirect } from 'next/navigation'

export const revalidate = 60
export const dynamicParams = true

export function generateStaticParams() {
  return []
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await params
  permanentRedirect('/target')
}
