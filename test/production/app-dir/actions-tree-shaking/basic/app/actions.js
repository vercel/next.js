'use server'

export async function serverComponentAction() {
  return 'server-action'
}

export async function clientComponentAction() {
  return 'client-action'
}

export async function unusedExportedAction() {
  return 'unused-exported-action'
}
