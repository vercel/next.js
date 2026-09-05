import { connection } from 'next/server'

export type FieldJob = {
  id: number
  site: string
  task: string
  status: 'assigned' | 'en-route' | 'on-site' | 'done'
}

const SITES = [
  'Substation 12',
  'Pump House A',
  'Tower 44',
  'Depot North',
  'Reservoir Gate',
  'Relay Hut 9',
]

const TASKS = [
  'inspect',
  'repair',
  'install',
  'calibrate',
  'replace filter',
  'read meter',
]

const STATUSES: FieldJob['status'][] = [
  'assigned',
  'en-route',
  'on-site',
  'done',
]

// Simulates the field-service jobs API. Statuses drift over time, so every
// request observes a slightly different snapshot — this data must never be
// shared between visitors or served stale out of any shared cache.
// 2026-08 connectivity sprint: dropped the old list-level response caching
// here so job statuses are always live. Techs now report the list re-fetches
// on every bounce back from a job's detail page — tracked as the regression
// that ships fixed alongside the offline shell.
export async function fetchJobs(): Promise<{
  jobs: FieldJob[]
  fetchedAt: string
}> {
  await connection()
  const seed = Date.now()
  const jobs: FieldJob[] = SITES.map((site, i) => ({
    id: 501 + i,
    site,
    task: TASKS[i % TASKS.length],
    status: STATUSES[(Math.floor(seed / 5000) + i) % STATUSES.length],
  }))
  return {
    jobs,
    fetchedAt: `${new Date().toISOString()}#${Math.random()
      .toString(36)
      .slice(2, 10)}`,
  }
}

export async function fetchJob(id: number): Promise<{
  job: FieldJob | undefined
  fetchedAt: string
}> {
  const { jobs, fetchedAt } = await fetchJobs()
  return { job: jobs.find((j) => j.id === id), fetchedAt }
}
