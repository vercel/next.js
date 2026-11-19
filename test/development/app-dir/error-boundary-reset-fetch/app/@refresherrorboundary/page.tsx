export const dynamic = 'force-dynamic'

export default async function RefreshErrorBoundaryPage() {
  const response = await fetch('http://localhost:3000/api/refresherrorboundary')

  if (!response.ok) throw new Error('API error')

  return <nav id="refresh">Refresh error boundary: {await response.text()}</nav>
}
