import { createRequire } from 'module'
import { dirname, resolve } from 'path'
import { isDeepStrictEqual } from 'util'
import { assertIstanbulProfile } from '../coverage/istanbul-profile'
import type { TestProfile } from '../contracts'
import type { NextConfigComplete } from '../../../server/config-shared'
import type { IstanbulInstrumentationDescriptor } from '../coverage/istanbul-types'

/** The ordinary Next loader pipeline consumes these actual options/code/maps. */
export function withIstanbulInstrumentation(
  config: NextConfigComplete,
  dir: string,
  profile: TestProfile,
  descriptor?: IstanbulInstrumentationDescriptor
): NextConfigComplete {
  if (descriptor === undefined) return config
  assertIstanbulProfile(profile)
  if (
    descriptor.version !== 1 ||
    !isDeepStrictEqual(descriptor.profile, profile) ||
    descriptor.metadata.version !== 1
  )
    throw new Error('Istanbul instrumentation profile or metadata differs.')
  if (
    Object.keys(config.turbopack?.rules ?? {}).length ||
    config.experimental.swcPlugins?.length
  )
    throw new Error(
      'Istanbul instrumentation cannot yet compose with Next loader rules or SWC plugins.'
    )
  const frameworkRoot = dirname(
    createRequire(resolve(dir, 'package.json')).resolve('next/package.json')
  )
  return {
    ...config,
    turbopack: {
      ...config.turbopack,
      rules: {
        '*.{js,mjs,cjs}': {
          loaders: [
            {
              loader: require.resolve('./istanbul-loader'),
              options: {
                descriptor: { ...descriptor.transport },
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
