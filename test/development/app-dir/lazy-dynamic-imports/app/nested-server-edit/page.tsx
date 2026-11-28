export default async function Page() {
  const { outerValue } = await import('./outer')
  return <p id="nested-server-edit">{await outerValue()}</p>
}
