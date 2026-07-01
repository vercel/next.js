'use server'

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

export async function getCompanyStaff(): Promise<Staff[]> {
  await sleep(60)
  return SEED_STAFF
}

export async function getCompanyProfile(): Promise<{ id: number }> {
  await sleep(600)
  return { id: 1 }
}

export async function getServices(): Promise<{ id: number }[]> {
  await sleep(800)
  return [{ id: 1 }, { id: 2 }]
}

export async function scheduleLoad(ms: number): Promise<boolean> {
  await sleep(ms)
  return true
}
