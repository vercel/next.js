import { hydrate, version } from './app-index'

window.next = {
  version,
  root: true,
}

hydrate()
