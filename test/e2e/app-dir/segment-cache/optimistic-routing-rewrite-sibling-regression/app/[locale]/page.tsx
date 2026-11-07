import { LinkAccordion } from '../../components/link-accordion'

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  return (
    <main>
      <h1>{`Home page: ${locale}`}</h1>
      <ul>
        <li>
          <LinkAccordion href="/en">en</LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/alpha">alpha</LinkAccordion>
        </li>
        <li>
          <LinkAccordion href="/beta">beta</LinkAccordion>
        </li>
      </ul>
    </main>
  )
}
