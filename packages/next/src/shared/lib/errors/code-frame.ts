import { getBindingsSync } from '../../../build/swc'
import type {
  NapiCodeFrameLocation,
  NapiCodeFrameOptions,
} from '../../../build/swc/generated-native'

/**
 * Renders a code frame showing the location of an error in source code.
 * Requires native bindings to be installed — throws otherwise.
 */
export function codeFrameColumns(
  file: string,
  location: NapiCodeFrameLocation,
  options: NapiCodeFrameOptions = {}
): string | undefined {
  // Default to the terminal width. The CLI passes it on when it pipes this
  // process's output for the upgrade menu.
  if (options.maxWidth === undefined) {
    options.maxWidth =
      process.stdout.columns ??
      (Number(process.env.NEXT_PRIVATE_TERMINAL_COLUMNS) || undefined)
  }
  return getBindingsSync().codeFrameColumns(file, location, options)
}

export type { NapiCodeFrameLocation, NapiCodeFrameOptions }
