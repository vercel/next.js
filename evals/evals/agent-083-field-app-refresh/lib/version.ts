// Single source of truth for the deployed shell version. The footer renders
// it, and anything that keys a cache off the shell must derive its name from
// it — bumping this one string is how an old shell gets invalidated.
export const APP_SHELL_VERSION = 'fieldkit-shell-v7_3f9a'

export function shellCacheName(): string {
  return `shell-cache-${APP_SHELL_VERSION}`
}
