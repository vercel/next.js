import fs from 'fs/promises'

let capabilityCalls = 0
const capabilityMode = process.env.NEXT_TEST_PRERENDER_BYPASS_CAPABILITIES

function getCapabilities() {
  capabilityCalls++
  const capabilities = {
    empty: {},
    disabled: {
      handlesHtmlLimitedBotPrerenders: false,
      supportsPrerenderMethodBypass: false,
    },
    bots: { handlesHtmlLimitedBotPrerenders: true },
    methods: { supportsPrerenderMethodBypass: true },
    both: {
      handlesHtmlLimitedBotPrerenders: true,
      supportsPrerenderMethodBypass: true,
    },
  }
  return capabilities[capabilityMode] ?? {}
}

/** @type {import('next').NextAdapter } */
export default {
  name: 'adapter-prerender-metadata',
  getCapabilities: capabilityMode === undefined ? undefined : getCapabilities,
  async onBuildComplete(ctx) {
    await fs.writeFile('build-complete.json', JSON.stringify(ctx, null, 2))
    await fs.writeFile('capability-calls.json', JSON.stringify(capabilityCalls))
  },
}
