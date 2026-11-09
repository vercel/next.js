export const shared = 'shared'

export async function loadConfig() {
  // Every export of `config.js` is used through this namespace object.
  const loaded = await import('./config.js')
  return loaded.config.locale
}
