import { LinkAccordion } from '../components/link-accordion'

export default async function Page() {
  return (
    <>
      <p id="static-page-no-prefetch">
        Static Page No Prefetch [prefetch-sentinel]
      </p>
      <p>
        <LinkAccordion href="/" id="to-home">
          To home
        </LinkAccordion>
      </p>
    </>
  )
}
