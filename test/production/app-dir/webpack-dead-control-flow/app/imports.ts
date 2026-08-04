export function loadDeadImport() {
  if (true) {
    return
  }

  import('./dead-module')
}

export function loadLiveImport() {
  if (false) {
    return
  }

  import('./live-module')
}
