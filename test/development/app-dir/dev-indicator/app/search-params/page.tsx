export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ a?: string }>
}) {
  const sp = await searchParams
  return <p>sp: {sp.a ?? 'none'}</p>
}
