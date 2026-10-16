export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ a?: string }>
}) {
  const sp = await searchParams

  return (
    <p>This is an app router page that reads searchParams: {sp.a ?? 'none'}</p>
  )
}
