import { hydrate, version } from './app-index'

// TODO-APP: implement FOUC guard

// TODO-APP: hydration warning

window.next = {
  version,
  appDir: true,
}

hydrate()

// TODO-APP: build indicator
