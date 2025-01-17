// This function ensures that all the exported values are valid server actions,
// during the runtime. By definition all actions are required to be async
// functions, but here we can only check that they are functions.
export function ensureServerEntryExports(actions: any[]) {
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i]
    if (typeof action !== 'function') {
      throw new Error(
        `A "use server" file can only export async functions, found ${typeof action}.\nRead more: https://nextjs.org/docs/messages/invalid-use-server-value`
      )
    }
  }
}
