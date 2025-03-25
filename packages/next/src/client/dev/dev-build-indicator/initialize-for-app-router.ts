import { devBuildIndicator } from './internal/dev-build-indicator'

/** Integrates the generic dev build indicator with the App Router. */
export const initializeDevBuildIndicatorForAppRouter = () => {
  if (!process.env.__NEXT_DEV_INDICATOR) {
    return
  }

  devBuildIndicator.initialize()
}
