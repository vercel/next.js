const serviceUrl = process.env.REPORT_SERVICE_URL!

export async function loadReportMetadata() {
  const response = await fetch(`${serviceUrl}/metadata`, { cache: 'no-store' })
  if (!response.ok) throw new Error('Failed to load report metadata')
  return (await response.json()) as { title: string }
}

export async function loadReport() {
  const response = await fetch(`${serviceUrl}/reports`, { cache: 'no-store' })
  if (!response.ok) throw new Error('Failed to load report')
  return (await response.json()) as { title: string; summary: string }
}
