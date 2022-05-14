import { hydrate, version } from './views-index'

window.next = {
  version,
  root: true,
}

hydrate()
