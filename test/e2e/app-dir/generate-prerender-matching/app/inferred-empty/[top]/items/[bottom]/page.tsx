export function generateStaticParams() {
  return [{ top: 't1', bottom: 'b1' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ top: string; bottom: string }>
}) {
  const { top, bottom } = await params
  return <p id="inferred-empty-params">{`${top}/${bottom}`}</p>
}
