import { devBuildIndicator } from './internal/dev-build-indicator'

/** Integrates the generic dev build indicator with the App Router. */
export const initializeDevBuildIndicatorForAppRouter = () => {
  if (!process.env.__NEXT_BUILD_INDICATOR) {
    return
  }

  devBuildIndicator.initialize(process.env.__NEXT_BUILD_INDICATOR_POSITION)
}
