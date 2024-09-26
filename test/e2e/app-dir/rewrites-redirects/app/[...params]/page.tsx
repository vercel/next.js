export default async function Page({
  params,
}: {
  params: Promise<{ params: Array<string> }>
}) {
  const { params: catchAllParams } = await params
  return (
    <div id="page" className={`page_${catchAllParams.join('_')}`}>
      {catchAllParams.join('/')}
    </div>
  )
}
