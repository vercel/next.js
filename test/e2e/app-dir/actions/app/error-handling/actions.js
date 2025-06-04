'use server'

export async function action(instance) {
  // Not allowed to access, as it's just a temporary reference.
  console.log(instance.value)
  return 'action result'
}
