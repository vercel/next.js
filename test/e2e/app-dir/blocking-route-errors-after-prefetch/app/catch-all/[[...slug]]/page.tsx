import { LinkAccordion } from '../../../components/link-accordion'

export default async function Page({
  params,
}: {
  params: Promise<{ slug?: string[] }>
}) {
  const { slug } = await params
  return (
    <>
      <h1 id="catch-all">Catch-all /{slug?.join('/')}</h1>
      <LinkAccordion href="/catch-all/missing">
        /catch-all/missing
      </LinkAccordion>
    </>
  )
}
