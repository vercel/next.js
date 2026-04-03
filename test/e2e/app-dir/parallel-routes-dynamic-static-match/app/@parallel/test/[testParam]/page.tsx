export default async function ParallelTestParamPage({
  params,
}: {
  params: Promise<{ testParam: string }>
}) {
  const { testParam } = await params
  return <p>Parallel: {testParam}</p>
}
