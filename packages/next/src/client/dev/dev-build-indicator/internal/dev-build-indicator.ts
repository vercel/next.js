const NOOP = () => {}

export const devBuildIndicator = {
  /** Shows build indicator when Next.js is compiling. Requires initialize() first. */
  show: NOOP,
  /** Hides build indicator when Next.js finishes compiling. Requires initialize() first. */
  hide: NOOP,
  /** Sets up the build indicator UI component. Call this before using show/hide. */
  initialize: process.env.__NEXT_EXPERIMENTAL_NEW_DEV_OVERLAY
    ? (
        require('./initialize-for-new-overlay') as typeof import('./initialize-for-new-overlay')
      ).initializeForNewOverlay
    : (
        require('./initialize-for-old-overlay') as typeof import('./initialize-for-old-overlay')
      ).initializeForOldOverlay,
}
