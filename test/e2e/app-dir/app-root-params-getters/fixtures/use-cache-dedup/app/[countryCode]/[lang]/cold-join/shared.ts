import { lang } from 'next/root-params'
import { setTimeout } from 'timers/promises'

// Shared by the direct and mixed cold-join pages, so that both reach the same
// public "use cache" function. The delay keeps the first (cold) fill in flight
// long enough for a concurrent request to join it.
export async function getTenantData() {
  'use cache'
  await setTimeout(2000)
  return {
    lang: await lang(),
    fillId: Math.random().toString(36).slice(2),
  }
}
