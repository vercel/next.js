import { version } from 'react'

export function init() {
  document.documentElement.dataset.lazyModuleLoaded = version
}
