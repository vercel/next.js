import { connection } from 'next/server'
import { LinkAccordion } from '../../../components/link-accordion'

export default async function ActualPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  await connection()

  return (
    <div id="actual-page">
      <h1>Actual page</h1>
      <p data-slug={slug}>Slug: {slug}</p>
      <LinkAccordion href="/hub">Hub</LinkAccordion>
    </div>
  )
}
