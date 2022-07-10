import { hydrate, version } from './app-index'

// TODO: implement FOUC guard

// TODO: hydration warning

window.next = {
  version,
  appDir: true,
}

hydrate()

// TODO: build indicator
