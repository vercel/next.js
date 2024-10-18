import RefreshClientPage from './client'

export const dynamic = 'force-dynamic'

export default async function RefreshPage() {
  const response = await fetch('http://localhost:3000/api/refresh')

  if (!response.ok) {
    return <RefreshClientPage />
  }

  return <nav id="refresh">Refresh: {await response.text()}</nav>
}
