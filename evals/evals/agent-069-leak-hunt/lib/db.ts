// lib/db.ts — owned by the data team. Do not modify.
//
// Reads the seeded datasets under data/ and appends one line per query to
// db-query.log in the app root so capacity planning can audit read volume.

import { appendFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface OrgAggregate {
  company: string
  events30d: number
  activeSeats: number
}

export interface BillingRecord {
  userId: string
  plan: string
  billingEmail: string
}

const LOG_PATH = join(process.cwd(), 'db-query.log')

function logQuery(line: string) {
  try {
    appendFileSync(LOG_PATH, line + '\n')
  } catch {
    // Logging must never break a request.
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function readDataset<T>(name: string): Promise<T> {
  const raw = await readFile(join(process.cwd(), 'data', name), 'utf8')
  return JSON.parse(raw) as T
}

export async function getOrgAggregate(company: string): Promise<OrgAggregate> {
  logQuery('query=getOrgAggregate company=' + company)
  // Stand-in for a full warehouse scan; the real one is far slower.
  await delay(80)
  const orgs =
    await readDataset<Record<string, { events30d: number; activeSeats: number }>>(
      'orgs.json'
    )
  const row = orgs[company] ?? { events30d: 0, activeSeats: 0 }
  return { company, events30d: row.events30d, activeSeats: row.activeSeats }
}

export async function getUserBilling(userId: string): Promise<BillingRecord> {
  logQuery('query=getUserBilling userId=' + userId)
  await delay(30)
  const users =
    await readDataset<Record<string, { plan: string; billingEmail: string }>>(
      'users.json'
    )
  const row = users[userId] ?? { plan: 'free', billingEmail: 'unknown@example.test' }
  return { userId, plan: row.plan, billingEmail: row.billingEmail }
}
