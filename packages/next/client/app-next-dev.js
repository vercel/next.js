import { hydrate, version } from './app-index'
import { displayContent } from './dev/fouc'

// TODO-APP: implement FOUC guard

// TODO-APP: hydration warning

window.next = {
  version,
  appDir: true,
}

hydrate({ onFlightCssLoaded: displayContent })

// TODO-APP: build indicator
