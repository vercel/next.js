export function generateStaticParams() {
  return [{ top: 'short' }, { top: 'long', bottom: 'example' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ top: string; bottom: string }>
}) {
  const { top, bottom } = await params
  return <p>{`${top}/${bottom}`}</p>
}
