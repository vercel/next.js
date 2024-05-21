'use server'

export async function action(instance: { someProperty: string }) {
  return instance.someProperty
}
