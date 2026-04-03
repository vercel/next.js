export default async function TestParamPage({
  params,
}: {
  params: Promise<{ testParam: string }>
}) {
  const { testParam } = await params
  return <p>Children: {testParam}</p>
}
