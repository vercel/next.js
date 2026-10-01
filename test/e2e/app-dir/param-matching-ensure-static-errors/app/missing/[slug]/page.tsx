export const unstable_ensureStatic = 'navigation'
export const unstable_paramMatching = { slug: 'blocking' }

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  return <p>{(await params).slug}</p>
}
