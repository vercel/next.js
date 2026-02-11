// Reproduction case for https://github.com/vercel/next.js/issues/69865
// This page dynamically imports server components based on a search param.
// Only the client components from the rendered branch should be in the bundle.

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string }>
}) {
  const { slug = 'page1' } = await searchParams

  if (slug === 'page1') {
    const { default: SC1 } = await import('./components/ServerComponent1')
    return (
      <div>
        <h1>Page 1</h1>
        <SC1 />
      </div>
    )
  } else {
    const { default: SC2 } = await import('./components/ServerComponent2')
    return (
      <div>
        <h1>Page 2</h1>
        <SC2 />
      </div>
    )
  }
}
