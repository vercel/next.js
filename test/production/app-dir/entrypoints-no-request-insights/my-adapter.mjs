import fs from 'fs'

// @ts-check
/** @type {import('next').NextAdapter} */
const adapter = {
  name: 'entrypoints-no-request-insights-adapter',
  async onBuildComplete({ outputs }) {
    await fs.promises.writeFile(
      'build-complete.json',
      JSON.stringify({ outputs }, null, 2)
    )
  },
}

export default adapter
