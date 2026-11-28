'use server'

export async function saveDraft(id: string, value: string) {
  return { ok: id === '1' && value === 'hello' }
}
