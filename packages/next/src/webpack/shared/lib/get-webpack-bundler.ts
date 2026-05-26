import { webpack } from '../../compiled/webpack/webpack'
import { getRspackCore } from 'next/dist/shared/lib/get-rspack'

/**
 * Depending on if Rspack is active or not, returns the appropriate set of
 * webpack-compatible api.
 *
 * @returns webpack bundler
 */
export default function getWebpackBundler(): typeof webpack {
  return process.env.NEXT_RSPACK ? getRspackCore() : webpack
}
