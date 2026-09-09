'use server'

const archived = new Set<string>()

export async function archiveMessage(id: string) {
  await new Promise((r) => setTimeout(r, 300))
  archived.add(id)
  return { archived: archived.size }
}
