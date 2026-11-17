export default async function Page({
  params,
}: {
  params: Promise<{ catchAll: string[] }>
}) {
  const { catchAll } = await params
  return <p id="slot-params">{catchAll.join('/')}</p>
}
