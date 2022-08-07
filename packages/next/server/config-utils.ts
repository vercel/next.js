export function createLoadRequireHook(callback?: () => void) {
  let installed: boolean = false

  return () => {
    if (installed) {
      return
    }
    installed = true

    callback?.()

    // load mapped modules
    require('../build/webpack/require-hook')
  }
}
