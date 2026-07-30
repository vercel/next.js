import { LinkAccordion } from '../../../../components/link-accordion'

export const metadata = {
  title: 'Fallback Shell Metadata Title',
}

export default async function Page({ params }) {
  const { slug } = await params
  return (
    <>
      <div id="slug">Hello /{slug}</div>
      <div>
        <LinkAccordion href="/without-io/metadata-hub">
          Go to metadata hub
        </LinkAccordion>
      </div>
    </>
  )
}

export async function generateStaticParams() {
  return [{ slug: 'foo' }]
}
