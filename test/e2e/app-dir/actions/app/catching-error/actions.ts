'use server'

export async function getServerData() {
  return Math.random()
}

export async function badAction() {
  throw new Error('oops')
}
