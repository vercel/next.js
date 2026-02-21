'use server'

export async function action(...args) {
  console.log(`Action was called with ${args.length} arguments.`)
}
