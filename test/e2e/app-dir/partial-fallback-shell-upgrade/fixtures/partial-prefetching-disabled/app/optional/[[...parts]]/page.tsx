export function generateStaticParams() {
  return [{ parts: [] }, { parts: ['named'] }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ parts?: string[] }>
}) {
  const { parts } = await params

  return (
    <div id="optional" data-rendered-at={performance.now()}>
      {parts?.join('/')}
    </div>
  )
}
