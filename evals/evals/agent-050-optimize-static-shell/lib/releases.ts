import { readFile } from 'node:fs/promises'
import { cookies } from 'next/headers'
import { connection } from 'next/server'

export type ReleaseChecklist = {
  title: string
  items: string[]
}

export type Rollout = {
  percent: number
  region: string
}

export function isKnownRelease(release: string): boolean {
  return release === 'aurora' || release === 'nebula'
}

export async function getCurrentViewer(): Promise<string> {
  const cookieStore = await cookies()
  return cookieStore.get('viewer')?.value ?? 'Release engineer'
}

export async function getLaunchChecklist(): Promise<ReleaseChecklist> {
  const source = await readFile(
    new URL('../data/launch-checklist.json', import.meta.url),
    'utf8'
  )
  return JSON.parse(source) as ReleaseChecklist
}

export async function getLiveRollout(release: string): Promise<Rollout> {
  await connection()

  return {
    percent: release === 'aurora' ? 72 : 18,
    region: release === 'aurora' ? 'Global' : 'Europe',
  }
}
