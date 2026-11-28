export default async function Page() {
  const { value } = await import('./value')
  return <p id="server-import-reload">{value}</p>
}
