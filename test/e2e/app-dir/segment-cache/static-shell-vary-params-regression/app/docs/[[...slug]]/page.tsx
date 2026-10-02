import { LinkAccordion } from '../../../components/link-accordion'

type Params = { slug?: string[] }

export function generateStaticParams(): Params[] {
  return [{ slug: [] }, { slug: ['alpha'] }, { slug: ['beta'] }]
}

/**
 * An optional catch-all where the index (empty slug) and the named pages are
 * the same route. The page reads `params`, so every one of these segments
 * varies by `slug` — the server reports that in the response's vary params.
 */
export default async function DocsPage({
  params,
}: {
  params: Promise<Params>
}) {
  const { slug } = await params
  const name = slug && slug.length > 0 ? slug.join('/') : 'index'
  return (
    <div>
      {/*
        The id is slug-specific so a test can wait for the navigation to
        actually commit — an id shared by every slug would match the
        pre-navigation DOM and read stale content.

        One interpolated string so the text is a single node in the RSC
        payload, which lets the test assert on response contents.
      */}
      <div id={`docs-page-${name}`}>{`Docs: ${name}`}</div>
      <LinkAccordion href="/docs/alpha">alpha</LinkAccordion>
      <LinkAccordion href="/docs/beta">beta</LinkAccordion>
    </div>
  )
}
