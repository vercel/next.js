import { LinkAccordion } from './components/link-accordion'

export default function HomePage() {
  return (
    <>
      <p id="home-page">Home Page [prefetch-sentinel]</p>
      <LinkAccordion href="/dashboard" id="to-dashboard">
        To Dashboard
      </LinkAccordion>
      <LinkAccordion href="/static-page" id="to-static-page">
        To Static Page
      </LinkAccordion>
      <LinkAccordion
        href="/static-page-no-prefetch"
        id="to-static-page-no-prefetch"
      >
        To Static Page No Prefetch
      </LinkAccordion>
      <LinkAccordion href="/dynamic-page" id="to-dynamic-page-no-params">
        To Dynamic Page
      </LinkAccordion>
      <LinkAccordion href="/prefetch-auto/foobar" id="to-dynamic-page">
        To Dynamic Slug Page
      </LinkAccordion>
      <a href="/static-page" id="to-static-page-hard">
        Hard Nav to Static Page
      </a>
    </>
  )
}
