import { LinkAccordion } from '../components/link-accordion'

export default function Page() {
  return (
    <main>
      <h1>Cache Stages Test</h1>
      <p>
        This fixture tests <code>unstable_navigation()</code> from{' '}
        <code>next/cache</code>. The target page at{' '}
        <code>/target-page?q=test</code> has a cached component that calls{' '}
        <code>await unstable_navigation()</code>. Content after that call should
        be excluded from runtime prefetch responses but included when the user
        actually navigates.
      </p>
      <p>
        To test manually: check the link accordion below to reveal the link.
        This triggers a runtime prefetch. Inspect the network response — it
        should contain "Included in prefetch" but not "Not included in
        prefetch". Then click the link to navigate. The full page should render,
        including "Not included in prefetch".
      </p>
      <div>
        <LinkAccordion href="/target-page?q=test">Target page</LinkAccordion>
      </div>
      <div>
        <LinkAccordion href="/dynamic-page?q=test">
          Dynamic page (no use cache)
        </LinkAccordion>
      </div>
      <div>
        <LinkAccordion href="/static-page">
          Static page (no runtime prefetch)
        </LinkAccordion>
      </div>
    </main>
  )
}
