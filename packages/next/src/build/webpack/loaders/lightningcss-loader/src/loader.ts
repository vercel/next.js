import type { LoaderContext } from 'webpack'
import type { ILightningCssLoaderConfig } from './interface'
import { ECacheKey } from './interface'
import { transformCss } from '../../../../swc'
import { Buffer } from 'buffer'
import { getTargets } from './utils'

const LOADER_NAME = `lightningcss-loader`
export async function LightningCssLoader(
  this: LoaderContext<ILightningCssLoaderConfig>,
  source: string,
  prevMap?: Record<string, any>
): Promise<void> {
  const done = this.async()
  const options = this.getOptions()
  const { implementation, targets: userTargets, ...opts } = options

  if (implementation && typeof implementation.transformCss !== 'function') {
    done(
      new TypeError(
        `[${LOADER_NAME}]: options.implementation.transformCss must be an 'lightningcss' transform function. Received ${typeof implementation.transformCss}`
      )
    )
    return
  }

  const transform = implementation?.transformCss ?? transformCss

  try {
    const { code, map } = transform({
      filename: this.resourcePath,
      code: Buffer.from(source),
      sourceMap: this.sourceMap,
      targets: getTargets({ default: userTargets, key: ECacheKey.loader }),
      inputSourceMap:
        this.sourceMap && prevMap ? JSON.stringify(prevMap) : undefined,
      ...opts,
    })
    const codeAsString = code.toString()
    done(null, codeAsString, map && JSON.parse(map.toString()))
  } catch (error: unknown) {
    done(error as Error)
  }
}
