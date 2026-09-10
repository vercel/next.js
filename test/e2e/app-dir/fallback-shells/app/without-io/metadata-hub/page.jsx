import { LinkAccordion } from '../../../components/link-accordion'

export const metadata = {
  title: 'Metadata Hub Title',
}

export default function Page() {
  return (
    <>
      <div id="hub">Metadata hub page content</div>
      <div>
        <LinkAccordion href="/without-io/with-metadata/world">
          Back to fallback page
        </LinkAccordion>
      </div>
    </>
  )
}
