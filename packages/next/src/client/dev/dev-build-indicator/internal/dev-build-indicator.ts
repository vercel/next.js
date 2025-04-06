import { initialize } from './initialize'

const NOOP = () => {}

export const devBuildIndicator = {
  /** Shows build indicator when Next.js is compiling. Requires initialize() first. */
  show: NOOP,
  /** Hides build indicator when Next.js finishes compiling. Requires initialize() first. */
  hide: NOOP,
  /** Sets up the build indicator UI component. Call this before using show/hide. */
  initialize,
}
