import { Suspense } from 'react'
import { LinkAccordion } from '../../../components/link-accordion'

// One accordion-hidden link per ancestor of the current catch-all path.
// `/one/two` is the interesting one: it has enough URL parts to fully match
// the learned `/[locale]/[...pages]` pattern, so a buggy client predicts the
// route (binding `locale` to "one") instead of asking the server. The links
// are hidden behind LinkAccordion checkboxes so the test controls exactly
// when each prefetch happens (inside an `act` scope).
async function Content({
  params,
}: Pick<PageProps<'/[locale]/[...pages]'>, 'params'>) {
  const { locale, pages } = await params

  return (
    <>
      {/* A param-derived string with a terminator, unique per path, so the
          test can assert that a prefetch response was rendered with the
          server-resolved params (locale "en"), not a mispredicted binding. */}
      <p id="params">{`params:${locale}:${pages.join('/')}:end`}</p>
      <nav>
        {pages.slice(0, -1).map((_, index) => {
          const href = `/${pages.slice(0, index + 1).join('/')}`
          return (
            <div key={href}>
              <LinkAccordion href={href}>{href}</LinkAccordion>
            </div>
          )
        })}
      </nav>
    </>
  )
}

export default function Page(props: PageProps<'/[locale]/[...pages]'>) {
  return (
    <main>
      <Suspense fallback={<p>loading content</p>}>
        <Content params={props.params} />
      </Suspense>
      <h1 id="page-title">Page content</h1>
    </main>
  )
}
