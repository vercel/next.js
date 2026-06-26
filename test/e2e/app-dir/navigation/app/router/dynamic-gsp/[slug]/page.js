export default async function Page({ params }) {
  return <div id="dynamic-gsp-content">{'slug:' + (await params).slug}</div>
}

export function generateStaticParams() {
  return [{ slug: '1' }, { slug: '2' }, { slug: '3' }]
}
