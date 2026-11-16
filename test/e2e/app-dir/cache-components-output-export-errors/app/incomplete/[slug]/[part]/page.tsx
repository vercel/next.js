export function generateStaticParams() {
  return [{ slug: 'first' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string; part: string }>
}) {
  const { slug, part } = await params
  return (
    <p>
      {slug}/{part}
    </p>
  )
}

export const unstable_paramMatching = {
  slug: 'not-found',
  part: 'not-found',
} as const
