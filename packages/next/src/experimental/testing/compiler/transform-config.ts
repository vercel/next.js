import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import type { NextConfigComplete } from '../../../server/config-shared'
import type { TestProfile } from '../contracts'
import type { CompilerTransformDescriptor } from './transform-broker'

/** Clone only this test compiler's resolved config; ordinary app config is intact. */
export function withCompilerTransforms(
  config: NextConfigComplete,
  dir: string,
  profile: TestProfile,
  descriptor?: CompilerTransformDescriptor
): NextConfigComplete {
  if (!descriptor) return config
  if (
    profile.environment !== 'node' ||
    profile.mode !== 'development' ||
    profile.route ||
    profile.browserClient
  )
    throw new Error(
      'Transform-only compiler plugins currently require a development Node profile.'
    )
  if (
    Object.keys(config.turbopack?.rules ?? {}).length ||
    config.experimental.swcPlugins?.length
  )
    throw new Error(
      'Transform-only compiler plugins cannot yet compose with existing Next loader rules or SWC plugins; their ordering must remain explicit.'
    )
  const frameworkRoot = dirname(
    createRequire(resolve(dir, 'package.json')).resolve('next/package.json')
  )
  return {
    ...config,
    turbopack: {
      ...config.turbopack,
      rules: {
        '*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}': {
          loaders: [
            {
              loader: require.resolve('./transform-loader'),
              options: {
                descriptor: { ...descriptor },
                projectRoot: dir,
                frameworkRoot,
              },
            },
          ],
        },
      },
    },
  }
}
