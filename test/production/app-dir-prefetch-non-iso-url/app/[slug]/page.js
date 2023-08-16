export default function Slug(props) {
  return (
    <>
      <p id="page">/[slug]</p>
      <p id="props">{JSON.stringify(props)}</p>
    </>
  )
}

export function generateStaticParams() {
  return [{ slug: 'iso-url' }, { slug: 'кириллица' }]
}
