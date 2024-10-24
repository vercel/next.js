export const dynamic = 'force-dynamic'

export default async function ResetPage() {
  const response = await fetch('http://localhost:3000/api/reset')

  if (!response.ok) throw new Error('API error')

  return <nav id="reset">Reset: {await response.text()}</nav>
}
