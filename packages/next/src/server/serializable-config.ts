import type { NextConfigComplete } from './config-shared'

// Create a type that overrides the experimental htmlLimitedBots field from RegExp to string
export type SerializableNextConfig = Omit<
  NextConfigComplete,
  'experimental'
> & {
  experimental: Omit<NextConfigComplete['experimental'], 'htmlLimitedBots'> & {
    htmlLimitedBots: string
  }
}

// Before serializing the config to the required files, we need to change the fields
// that are primitives like RegExp that cannot handled by JSON.stringify to string,
// so that they can be serialized properly rather than be treat as {}.
function toSerializableNextConfig(config: NextConfigComplete) {
  const normalizedConfig: any = { ...config }
  if (config.experimental?.htmlLimitedBots instanceof RegExp) {
    normalizedConfig.experimental.htmlLimitedBots =
      config.experimental.htmlLimitedBots.source
  }

  return normalizedConfig as SerializableNextConfig
}

// Recover from the serialized config to the original config.
// For normal cases this config is NextConfigComplete, but for the serialized config such as deployment,
// this is SerializableNextConfig where being stringified and inlined in the code.
function toNormalizedNextConfig(
  config: SerializableNextConfig | NextConfigComplete
) {
  const normalizedConfig: any = { ...config }
  if (typeof config.experimental?.htmlLimitedBots === 'string') {
    normalizedConfig.experimental.htmlLimitedBots = new RegExp(
      config.experimental.htmlLimitedBots
    )
  }

  return normalizedConfig as NextConfigComplete
}

export const nextConfigNormalizer = {
  toSerializableNextConfig,
  toNormalizedNextConfig,
}
