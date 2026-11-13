export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return <p>{(await params).slug}</p>
}

export const unstable_paramMatching = { slug: 'not-found' } as const
