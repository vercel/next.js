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
      <LinkAccordion href="/stale-time-static" id="to-stale-time-static">
        To Static Page with staleTime export
      </LinkAccordion>
      <LinkAccordion href="/stale-time-inherit" id="to-stale-time-inherit">
        To Page inheriting staleTime from layout
      </LinkAccordion>
      <LinkAccordion
        href="/stale-time-inherit/override"
        id="to-stale-time-override"
      >
        To Page overriding layout staleTime
      </LinkAccordion>
      <LinkAccordion href="/stale-time-dynamic" id="to-stale-time-dynamic">
        To Dynamic Page with staleTime export
      </LinkAccordion>
      <LinkAccordion href="/stale-time-nested/inner" id="to-stale-time-nested">
        To Nested Layout with staleTime (inner=200, outer=100)
      </LinkAccordion>
      <LinkAccordion href="/stale-time-zero" id="to-stale-time-zero">
        To Page with staleTime=0
      </LinkAccordion>
      <LinkAccordion href="/stale-time-parallel" id="to-stale-time-parallel">
        To Parallel Routes with different staleTime
      </LinkAccordion>
    </>
  )
}
