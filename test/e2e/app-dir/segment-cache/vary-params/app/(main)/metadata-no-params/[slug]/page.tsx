type Params = { slug: string }

/**
 * Page with generateMetadata that does NOT access params.
 *
 * This tests that when metadata doesn't access params, the head segment
 * can be cached and reused across different param values.
 */
export async function generateStaticParams(): Promise<Params[]> {
  return [{ slug: 'aaa' }, { slug: 'bbb' }]
}

export async function generateMetadata() {
  // Intentionally NOT accessing params here
  return { title: 'Static Title' }
}

export default function MetadataNoParamsPage() {
  return (
    <div id="metadata-no-params-page">
      <div data-content="true">Page content (params not accessed)</div>
    </div>
  )
}
