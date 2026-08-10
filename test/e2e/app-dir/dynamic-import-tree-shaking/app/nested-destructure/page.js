export default async function Page() {
  const {
    nested: { inner },
  } = await import('../../lib/nested-module')
  return <div>{inner}</div>
}
