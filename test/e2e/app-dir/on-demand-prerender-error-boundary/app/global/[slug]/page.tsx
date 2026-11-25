import { LinkAccordion } from '../../../link-accordion'

export function generateStaticParams() {
  return [{ slug: 'prerendered' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  if (slug === 'error') {
    throw new Error('On-demand page render failed')
  }

  if (slug.startsWith('error-')) {
    return (
      <>
        <h1>{slug}</h1>
        <LinkAccordion href={`/${slug}`}>Open failing page</LinkAccordion>
      </>
    )
  }

  return <h1>{slug}</h1>
}
