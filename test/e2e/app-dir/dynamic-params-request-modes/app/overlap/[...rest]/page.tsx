export default async function Page({
  params,
}: {
  params: Promise<{ rest: string[] }>
}) {
  const { rest } = await params
  return <p id="catch-all">{rest.join('/')}</p>
}
