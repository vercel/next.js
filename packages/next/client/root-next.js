import { hydrate, version } from './root-index'

window.next = {
  version,
  root: true,
}

hydrate()
