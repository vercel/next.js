export function generateStaticParams({ params }) {
  if (!params) throw new Error('Params are undefined')

  return [{ slug: 'first' }, { slug: 'second' }]
}

export default function Page({ params }) {
  return (
    <>
      <p id="page">/gen-params-top-down-page/[lang]/[slug]</p>
      <p id="params">{JSON.stringify(params)}</p>
    </>
  )
}
