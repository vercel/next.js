'use server'

export async function serverLog(content) {
  throw new Error('[server-action]:' + content)
}
