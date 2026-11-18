import fs from 'fs/promises'

let capabilityCalls = 0
const capabilityMode = process.env.NEXT_TEST_HTML_LIMITED_BOT_CAPABILITY

function getCapabilities() {
  capabilityCalls++
  return capabilityMode === 'empty'
    ? {}
    : {
        handlesHtmlLimitedBotPrerenders: capabilityMode !== 'disabled',
      }
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
