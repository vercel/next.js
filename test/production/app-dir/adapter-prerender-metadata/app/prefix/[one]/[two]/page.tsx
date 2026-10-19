export default async function Page({
  params,
}: {
  params: Promise<{ one: string; two: string }>
}) {
  const { one, two } = await params

  return (
    <div>
      {one}:{two}
    </div>
  )
}
