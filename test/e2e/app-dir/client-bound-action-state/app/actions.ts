'use server'

export type UpdateState = {
  readonly message: string
}

export async function updateUser(
  userId: string,
  _previousState: UpdateState,
  formData: FormData
): Promise<UpdateState> {
  const message = `Updated ${userId} to ${String(formData.get('name'))}`
  console.log(`[client-bound-action-state] ${message}`)
  return { message }
}
