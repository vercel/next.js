'use server'

// Synthetic, in-memory seed data. No DB, no production data.
export interface Staff {
  id: number
  name: string
}

const SEED_STAFF: Staff[] = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1,
  name: `Doctor ${i + 1}`,
}))

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms))

// Mirrors the real getCompanyStaff server action that React Query + CompanyProvider both call.
export async function getCompanyStaff(): Promise<Staff[]> {
  await sleep(60)
  return SEED_STAFF
}

// Mirrors getCompanyProfile. Deliberately slower than the staff list so its setState
// lands AFTER the row is clicked — i.e. during the pending schedule navigation.
export async function getCompanyProfile(): Promise<{ id: number }> {
  await sleep(600)
  return { id: 1 }
}

// Mirrors getServices/getServiceGroups. Slowest, to land deep in the pending-nav window.
export async function getServices(): Promise<{ id: number }[]> {
  await sleep(800)
  return [{ id: 1 }, { id: 2 }]
}

// Mirrors the schedule page's per-request server-side loads.
export async function scheduleLoad(ms: number): Promise<boolean> {
  await sleep(ms)
  return true
}
