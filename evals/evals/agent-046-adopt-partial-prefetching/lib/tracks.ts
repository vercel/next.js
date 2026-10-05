import { cookies } from 'next/headers'

export type Track = {
  slug: string
  title: string
  artist: string
}

const tracks: Record<string, Track> = {
  aurora: { slug: 'aurora', title: 'Aurora', artist: 'Echo North' },
  nebula: { slug: 'nebula', title: 'Nebula', artist: 'Static Gardens' },
}

export async function getTrack(slug: string) {
  const cookieStore = await cookies()
  const listener = cookieStore.get('listener')?.value ?? 'guest'
  return queryTrack(slug, listener)
}

async function queryTrack(slug: string, listener: string) {
  await new Promise((resolve) => setTimeout(resolve, 120))
  const track = tracks[slug]
  return track ? { ...track, listener } : null
}

export async function getRecommendations(slug: string) {
  await new Promise((resolve) => setTimeout(resolve, 500))
  return Object.values(tracks).filter((track) => track.slug !== slug)
}
