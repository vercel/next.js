'use server'

export async function saveDraft(id: string, value: string) {
  console.log('draft-saved:' + id + ':' + value)
  return { ok: true }
}
