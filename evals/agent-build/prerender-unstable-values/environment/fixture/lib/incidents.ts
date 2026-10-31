import { cacheLife, cacheTag } from 'next/cache'

export type Incident = {
  id: string
  service: string
  title: string
  status: 'investigating' | 'monitoring' | 'resolved'
  startedAt: string
}

const seed: Incident[] = [
  {
    id: 'inc_204',
    service: 'API',
    title: 'Elevated latency in eu-central',
    status: 'monitoring',
    startedAt: '2026-10-20T08:12:00.000Z',
  },
  {
    id: 'inc_203',
    service: 'Dashboard',
    title: 'Intermittent sign-in failures',
    status: 'resolved',
    startedAt: '2026-10-14T16:40:00.000Z',
  },
  {
    id: 'inc_201',
    service: 'Webhooks',
    title: 'Delayed delivery for a subset of endpoints',
    status: 'resolved',
    startedAt: '2026-10-02T03:05:00.000Z',
  },
]

export async function getIncidents(): Promise<Incident[]> {
  'use cache'
  cacheLife('minutes')
  cacheTag('incidents')

  // Stand-in for the monitoring backend.
  await new Promise((resolve) => setTimeout(resolve, 25))
  return seed
}
