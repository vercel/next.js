export default async function Page() {
  // eslint-disable-next-line no-empty-pattern
  const {} = await import('../../lib/empty-module')
  return <div>TREESHAKE_EMPTY_PAGE</div>
}
