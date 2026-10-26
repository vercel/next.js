import { getSlug } from './actions'

async function getCachedAction() {
  'use cache'
  return getSlug
}

export async function generateStaticParams() {
  const action = await getCachedAction()
  return [{ slug: await action() }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return <p>{slug}</p>
}
