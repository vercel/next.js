export const ensureStatic = 'navigation'
export const unstable_paramMatching = { bottom: 'blocking' }

export function generateStaticParams() {
  return [{ top: 't1' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ top: string; bottom: string }>
}) {
  const { top, bottom } = await params
  return (
    <p>
      {top}/{bottom}
    </p>
  )
}
