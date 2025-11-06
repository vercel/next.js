'use server'

export async function throwErrorAction() {
  throw new Error('action error')
}
