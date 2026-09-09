'use server'

export async function outer(prefix: string) {
  async function inner(value: string) {
    'use server'
    return `${prefix}:${value}`
  }

  return inner
}
