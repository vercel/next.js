import fs from 'node:fs/promises'

/** @type {import('next').NextAdapter} */
export default {
  name: 'websocket-route-handlers',
  async onBuildComplete(context) {
    await fs.writeFile('build-complete.json', JSON.stringify(context, null, 2))
  },
}
