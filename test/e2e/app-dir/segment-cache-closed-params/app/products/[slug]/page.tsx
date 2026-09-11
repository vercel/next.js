export const experimental_paramMatching = { slug: 'not-found' } as const

export function generateStaticParams() {
  return [{ slug: 'allowed' }]
}

// The page does not read slug, so its segment data can be shared. The matcher
// still needs to reject values that generateStaticParams did not return.
export default function Page() {
  return <p id="product-page">Allowed product page</p>
}
