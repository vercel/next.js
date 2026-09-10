import { getCachedSentinelValue } from '../../sentinel'

export async function generateStaticParams() {
  return [{ slug: 'built' }]
}

// The shape of `/declared/[slug]` with no variants at all: the param is read
// above every boundary here too, so this fallback shell is empty as well, and
// the route is absent from the proxy.
//
// It exists so that what a param the build never named costs is read off a
// route that declares no combinations, rather than asserted from memory. A
// difference between the two is what makes such a cost specific to variants.
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  return (
    <>
      <p id="slug">{slug}</p>
      <p id="cached-sentinel">{await getCachedSentinelValue()}</p>
    </>
  )
}
