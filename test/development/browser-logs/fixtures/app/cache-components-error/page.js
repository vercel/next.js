export default function CacheComponentsErrorPage() {
  // Reading the current time during render is uncached sync IO. With Cache
  // Components enabled, and without a parent Suspense boundary, this triggers a
  // prerender validation error.
  const now = new Date().toISOString()

  return <p>{now}</p>
}
