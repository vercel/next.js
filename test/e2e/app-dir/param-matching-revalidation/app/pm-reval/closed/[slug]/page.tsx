import { getStamp } from '../../../stamp'

export const unstable_paramMatching = { slug: 'not-found' } as const

export function generateStaticParams() {
  return [{ slug: 'a' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return (
    <main>
      <p id="params">{slug}</p>
      <p id="stamp">{await getStamp('closed', slug)}</p>
    </main>
  )
}
