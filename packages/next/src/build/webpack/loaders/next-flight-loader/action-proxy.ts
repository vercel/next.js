export default function ensureServerEntryExports(actions: any[]) {
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i]
    if (typeof action !== 'function') {
      throw new Error(
        `A "use server" file can only export async functions, found ${typeof action}.`
      )
    }
  }
}
