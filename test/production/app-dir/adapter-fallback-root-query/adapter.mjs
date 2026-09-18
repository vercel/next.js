import { writeFile } from 'node:fs/promises'

export default {
  name: 'fallback-root-query-contract',
  async onBuildComplete({ outputs, routing }) {
    await writeFile('adapter-output.json', JSON.stringify({ outputs, routing }))
  },
}
