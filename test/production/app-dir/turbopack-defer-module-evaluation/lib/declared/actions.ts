'use server'

export async function declaredAction(value: string) {
  return `declared-action:${value}`
}
