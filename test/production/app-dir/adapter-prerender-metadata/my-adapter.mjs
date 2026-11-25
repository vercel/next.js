import fs from 'fs/promises'
import { writeFileSync } from 'fs'

let capabilityCalls = 0
const capabilityMode = process.env.NEXT_TEST_PRERENDER_BYPASS_CAPABILITIES

function getCapabilities({ config }) {
  capabilityCalls++
  writeFileSync(
    'capability-config.json',
    JSON.stringify({
      htmlLimitedBots: config.htmlLimitedBots,
      cacheComponents: config.cacheComponents,
      modified: config.env.ADAPTER_CAPABILITY_CONTEXT,
    })
  )
  const capabilities = {
    empty: {},
    disabled: {
      supportsHtmlLimitedBotPrerenders: false,
      supportsPrerenderMethodBypass: false,
    },
    bots: { supportsHtmlLimitedBotPrerenders: true },
    methods: { supportsPrerenderMethodBypass: true },
    both: {
      supportsHtmlLimitedBotPrerenders: true,
      supportsPrerenderMethodBypass: true,
    },
  }
  return capabilities[capabilityMode] ?? {}
}

/** @type {import('next').NextAdapter } */
export default {
  name: 'adapter-prerender-metadata',
  modifyConfig(config) {
    config.env = { ...config.env, ADAPTER_CAPABILITY_CONTEXT: 'applied' }
    return config
  },
  getCapabilities: capabilityMode === undefined ? undefined : getCapabilities,
  async onBuildComplete(ctx) {
    await fs.writeFile('build-complete.json', JSON.stringify(ctx, null, 2))
    await fs.writeFile('capability-calls.json', JSON.stringify(capabilityCalls))
  },
}
