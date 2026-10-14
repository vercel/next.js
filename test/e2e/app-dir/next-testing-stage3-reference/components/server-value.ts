import 'server-only'

export async function serverValue() {
  await Promise.resolve()
  return 'L3_SERVER_ONLY_VALUE'
}
