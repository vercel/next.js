import { LinkAccordion } from '../components/link-accordion'
import { BackButton } from './back-button'

export default async function Page() {
  return (
    <>
      <p id="static-page">Static Page [prefetch-sentinel]</p>
      <p>
        <LinkAccordion href="/" id="to-home">
          To home
        </LinkAccordion>
      </p>
      <p>
        <LinkAccordion href="/static-page" id="to-same-page">
          To Static Page (self)
        </LinkAccordion>
      </p>
      <p>
        <BackButton />
      </p>
    </>
  )
}
