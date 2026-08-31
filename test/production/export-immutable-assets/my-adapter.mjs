import fs from 'node:fs/promises'
import path from 'node:path'

/** @type {import('next').NextAdapter} */
const adapter = {
  name: 'export-immutable-assets-test-adapter',
  modifyConfig(config) {
    config.supportsImmutableAssets = true
    return config
  },
  async onBuildComplete({ projectDir, outputs }) {
    await fs.writeFile(
      path.join(projectDir, 'build-complete.json'),
      JSON.stringify(outputs.staticFiles)
    )
  },
}

export default adapter
