export const dynamicParams = false

export function generateStaticParams() {
  return [{ lang: 'en', slug: 'allowed' }]
}

export default function Page() {
  return <p id="catalog-page">Allowed catalog page</p>
}
