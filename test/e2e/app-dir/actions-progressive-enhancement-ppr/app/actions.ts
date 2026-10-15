'use server'

export async function increment(
  previousState: { count: number; name: string },
  formData: FormData
) {
  return {
    count: previousState.count + 1,
    name: String(formData.get('name') ?? ''),
  }
}
