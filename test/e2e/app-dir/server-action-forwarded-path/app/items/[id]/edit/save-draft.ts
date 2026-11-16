'use server'

export async function saveDraft(id: string, text: string) {
  return `${id}:${text}`
}
