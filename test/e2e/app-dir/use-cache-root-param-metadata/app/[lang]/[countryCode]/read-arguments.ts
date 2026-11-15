export async function readArguments(enabled: boolean) {
  'use cache'
  const value = enabled ? 'enabled' : 'disabled'
  return value
}
