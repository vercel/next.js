export const dynamic = 'force-dynamic'

export default async function RefreshPage() {
  const response = await fetch('http://localhost:3000/api/refresh')

  if (!response.ok) throw new Error('API error')

  return <nav id="refresh">Refresh: {await response.text()}</nav>
}
