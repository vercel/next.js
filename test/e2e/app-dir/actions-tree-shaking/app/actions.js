'use server'

export async function action() {
  return 'hello'
}

export async function unusedExportedAction() {
  return 'unused-exported-action'
}
