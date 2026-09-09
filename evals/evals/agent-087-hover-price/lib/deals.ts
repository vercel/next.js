export interface Deal {
  id: string
  title: string
}

// The day's 50 featured deals. Ids are stable; the merchandising job
// regenerates titles nightly.
export const deals: Deal[] = Array.from({ length: 50 }, (_, i) => {
  const id = String(i + 1)
  return { id, title: `Deal ${id} · save ${10 + ((i * 7) % 50)}%` }
})
