export default function Page({ params }) {
  return <div id="dynamic-gsp-content">{'slug:' + params.slug}</div>
}

export function generateStaticParams() {
  return [{ slug: '1' }, { slug: '2' }, { slug: '3' }]
}
