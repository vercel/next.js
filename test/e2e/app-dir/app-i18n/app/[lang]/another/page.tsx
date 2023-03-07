export const dynamicParams = false

export async function generateStaticParams() {
  return [{ lang: 'en' }, { lang: 'id' }]
}

export default function Page({ params }) {
  return <div>Another page. Lang: {params.lang}</div>
}
