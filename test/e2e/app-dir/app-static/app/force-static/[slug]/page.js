// force-static should override the `headers()` usage
// in parent layout
export const dynamic = 'force-static'

export function generateStaticParams() {
  return [{ slug: 'first' }, { slug: 'second' }]
}

export default function Page({ params }) {
  return (
    <>
      <p id="page">/force-static/[slug]</p>
      <p id="params">{JSON.stringify(params)}</p>
      <p id="now">{Date.now()}</p>
    </>
  )
}
