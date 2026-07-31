'use server'

export async function trackedServerAction(argument: string) {
  void argument
  return 'server-action-complete'
}
