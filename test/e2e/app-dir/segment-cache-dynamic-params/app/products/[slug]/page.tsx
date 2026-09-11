export const dynamicParams = false

export function generateStaticParams() {
  return [{ slug: 'allowed' }]
}

export default function Page() {
  return <p id="product-page">Allowed product page</p>
}
